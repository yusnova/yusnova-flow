/**
 * API artifact generator (foundry / generated-client style).
 *
 * Given the API routes discovered by `scanAppUnderTest`, this writes a fully
 * typed, foundry-compatible API surface — no LLM, no OpenAPI file required:
 *
 *   1. core/api/generated/model/<domain>.ts     — request/response types
 *   2. core/api/generated/api/<domain>-api.ts    — <Domain>Api extends BaseAPI
 *   3. core/api/generated/index.ts               — re-export (idempotent patch)
 *   4. core/api/foundry-api.ts                    — register on FoundryAPI (idempotent)
 *   5. domains/<domain>/<domain>.schemas.ts       — zod response schemas
 *   6. suites/<domain>/<domain>.api.spec.ts       — positive + negative API spec
 *
 * Schema source (hybrid):
 *   - If `core/api/generated/model/<domain>.ts` exists (swagger or prior STLC),
 *     schemas are derived FROM those Response types (contract = generated).
 *   - Otherwise schemas come from the app-scan success shape (same IR that
 *     builds the model). Spec generation is identical either way:
 *     foundryAPI.* + assertStatus + assertSchema.
 *
 * Base URL contract: generated client paths are relative to `apiBaseURL`.
 * Scanned Next routes like `/api/skips` are rewritten to `/skips` so that
 * `DEMO_API_BASE_URL=http://localhost:3000/api` works (matches auth/products).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ScannedApiRoute, ScannedSuccessField } from '../../shared/app-scanner'
import { smartValue, wrongTypeValue, type PrimitiveType } from '../../shared/smart-values'

/** Strip a leading `/api` so paths compose with an apiBaseURL that already ends in `/api`. */
function toClientPath(routePath: string): string {
  const normalized = routePath.startsWith('/') ? routePath : `/${routePath}`
  if (normalized === '/api') return '/'
  if (normalized.startsWith('/api/')) return normalized.slice(4)
  return normalized
}

export interface ApiGenResult {
  modelPath: string
  clientPath: string
  schemaPath: string
  specPath: string
  routeCount: number
  caseCount: number
  patchedFoundry: boolean
  patchedIndex: boolean
  /** Where response Zod schemas were derived from. */
  schemaSource: 'generated-model' | 'app-scan'
}

interface RouteMethod {
  route: ScannedApiRoute
  methodName: string
  reqTypeName?: string
  resTypeName: string
  isQuery: boolean
}

function pascal(input: string): string {
  return input
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

function camel(input: string): string {
  const p = pascal(input)
  return p.charAt(0).toLowerCase() + p.slice(1)
}

function methodNameFor(route: ScannedApiRoute, used: Set<string>): string {
  const segments = route.routePath
    .split('/')
    .filter(Boolean)
    .filter((s) => s.toLowerCase() !== 'api')
    .map((s) => s.replace(/[{}]/g, ''))
  let base = camel(segments.join(' ')) || camel(route.method)
  if (used.has(base)) base = `${camel(route.method)}${pascal(base)}`
  let name = base
  let i = 2
  while (used.has(name)) name = `${base}${i++}`
  used.add(name)
  return name
}

function tsType(t: PrimitiveType): string {
  return t === 'unknown' ? 'unknown' : t
}

function tsResponseType(t: ScannedSuccessField['type']): string {
  switch (t) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'unknown[]'
    case 'object':
      return 'Record<string, unknown>'
    default:
      return 'unknown'
  }
}

function zodForSuccessField(field: ScannedSuccessField): string {
  switch (field.type) {
    case 'string':
      if (/email/i.test(field.name)) return 'z.email()'
      if (/id|token/i.test(field.name)) return 'z.string().min(1)'
      return 'z.string()'
    case 'number':
      return 'z.number()'
    case 'boolean':
      return 'z.boolean()'
    case 'array':
      return 'z.array(z.unknown())'
    case 'object':
      return 'z.record(z.string(), z.unknown())'
    default:
      return 'z.unknown()'
  }
}

function successFieldsFor(route: ScannedApiRoute): ScannedSuccessField[] {
  if (route.successFields?.length) return route.successFields
  return (route.successKeys ?? []).map((name) => ({ name, type: 'unknown' as const }))
}

function tightenFieldType(
  name: string,
  fallback: ScannedSuccessField['type'],
): ScannedSuccessField['type'] {
  if (fallback !== 'unknown') return fallback
  if (/^(ok|success|enabled|active)$/i.test(name)) return 'boolean'
  if (/(addresses|skips|items|results|list|entries)$/i.test(name)) return 'array'
  if (/(count|total|amount|price|qty|quantity|page|size)$/i.test(name)) return 'number'
  if (/(id|token|status|email|name|message|code|url|path|postcode)$/i.test(name)) return 'string'
  return 'unknown'
}

function mapTsTypeToSuccessType(tsType: string): ScannedSuccessField['type'] {
  const t = tsType.replace(/\s+/g, ' ').trim()
  if (/^string(\s*\|\s*null)?$/.test(t)) return 'string'
  if (/^number(\s*\|\s*null)?$/.test(t)) return 'number'
  if (/^boolean(\s*\|\s*null)?$/.test(t)) return 'boolean'
  if (/unknown\[\]|Array<|^\w+\[\]$/.test(t)) return 'array'
  if (/^Record<|^\{\s*\[/.test(t) || /^object$/.test(t)) return 'object'
  return 'unknown'
}

/**
 * Parse `export type FooResponse = { ... }` / `export interface FooResponse { ... }`
 * from an on-disk generated model so Zod mirrors the Foundry contract.
 */
export function parseGeneratedModelResponseTypes(
  modelSource: string,
): Map<string, ScannedSuccessField[]> {
  const out = new Map<string, ScannedSuccessField[]>()
  const typeRe =
    /export\s+(?:type|interface)\s+([A-Za-z0-9_]+)\s*(?:=\s*)?\{([\s\S]*?)\n\}/g
  let match: RegExpExecArray | null
  while ((match = typeRe.exec(modelSource))) {
    const typeName = match[1]!
    if (!/Response$/.test(typeName)) continue
    const body = match[2]!
    const fields: ScannedSuccessField[] = []
    for (const line of body.split('\n')) {
      const fieldMatch = line.match(/^\s*([A-Za-z_][\w]*)\??\s*:\s*([^;/,]+)/)
      if (!fieldMatch) continue
      const name = fieldMatch[1]!
      const rawType = fieldMatch[2]!.trim()
      fields.push({
        name,
        type: tightenFieldType(name, mapTsTypeToSuccessType(rawType)),
      })
    }
    if (fields.length > 0) out.set(typeName, fields)
  }
  return out
}

function resolveSchemaFields(
  method: RouteMethod,
  fromModel: Map<string, ScannedSuccessField[]> | null,
): ScannedSuccessField[] {
  const fromGenerated = fromModel?.get(method.resTypeName)
  if (fromGenerated && fromGenerated.length > 0) return fromGenerated
  return successFieldsFor(method.route)
}

function buildSchemas(
  domain: string,
  methods: RouteMethod[],
  fromModel: Map<string, ScannedSuccessField[]> | null,
  schemaSource: 'generated-model' | 'app-scan',
): string {
  const sourceNote =
    schemaSource === 'generated-model'
      ? `Derived from core/api/generated/model/${domain}.ts (Foundry contract).`
      : `Derived from app-scan success shapes (no usable generated Response types).`

  const lines = [
    `import { z } from 'zod'`,
    '',
    `// AUTO-GENERATED response schemas for the ${domain} API.`,
    `// ${sourceNote}`,
    `// Wired into suites/${domain}/${domain}.api.spec.ts via ApiAssertions.assertSchema.`,
    '',
  ]
  for (const m of methods) {
    const fields = resolveSchemaFields(m, fromModel)
    const shape =
      fields.length > 0
        ? `z.object({\n${fields.map((f) => `  ${f.name}: ${zodForSuccessField(f)},`).join('\n')}\n}).loose()`
        : `z.record(z.string(), z.unknown())`
    lines.push(`export const ${camel(m.methodName)}ResponseSchema = ${shape}`)
    lines.push('')
  }
  return lines.join('\n') + '\n'
}

function buildModel(domainPascal: string, methods: RouteMethod[]): string {
  const blocks: string[] = [
    `// AUTO-GENERATED by stlc:orchestrator api-gen for domain "${domainPascal}".`,
    `// Regenerated on each run with --overwrite. Safe to edit only if you stop regenerating.`,
    '',
  ]

  for (const m of methods) {
    if (m.reqTypeName) {
      const fields = m.route.fields
      if (fields.length === 0) {
        blocks.push(`export type ${m.reqTypeName} = Record<string, never>`)
      } else {
        const lines = fields.map(
          (f) => `  ${f.name}${f.required ? '' : '?'}: ${tsType(f.type)}`,
        )
        blocks.push(`export type ${m.reqTypeName} = {\n${lines.join('\n')}\n}`)
      }
    }

    const fields = successFieldsFor(m.route)
    if (fields.length === 0) {
      blocks.push(`export type ${m.resTypeName} = Record<string, unknown>`)
    } else {
      const lines = fields.map((f) => `  ${f.name}: ${tsResponseType(f.type)}`)
      blocks.push(`export type ${m.resTypeName} = {\n${lines.join('\n')}\n}`)
    }
    blocks.push('')
  }

  return blocks.join('\n') + '\n'
}

function buildClient(domainPascal: string, domain: string, methods: RouteMethod[]): string {
  const typeImports = methods
    .flatMap((m) => [m.reqTypeName, m.resTypeName])
    .filter((t): t is string => Boolean(t))

  const header = [
    `// AUTO-GENERATED by stlc:orchestrator api-gen for domain "${domain}".`,
    `import type { AxiosRequestConfig, AxiosResponse } from 'axios'`,
    `import { BaseAPI } from '@core/api/generated/base'`,
    `import type { Configuration } from '@core/api/generated/configuration'`,
    `import type { ${typeImports.join(', ')} } from '@core/api/generated/model/${domain}'`,
    '',
    `function toQuery(params: Record<string, unknown>): string {`,
    `  const usp = new URLSearchParams()`,
    `  for (const [key, value] of Object.entries(params)) {`,
    `    if (value !== undefined && value !== null) usp.set(key, String(value))`,
    `  }`,
    `  const qs = usp.toString()`,
    `  return qs ? \`?\${qs}\` : ''`,
    `}`,
    '',
    `export class ${domainPascal}Api extends BaseAPI {`,
    `  constructor(configuration: Configuration) {`,
    `    super(configuration)`,
    `  }`,
    '',
  ]

  const body: string[] = []
  for (const m of methods) {
    const clientPath = toClientPath(m.route.routePath)
    const pathLiteral = JSON.stringify(clientPath)
    if (m.isQuery) {
      const paramType = m.reqTypeName ?? 'Record<string, unknown>'
      body.push(
        `  ${m.methodName}(params: ${paramType} = {} as ${paramType}, options?: AxiosRequestConfig): Promise<AxiosResponse<${m.resTypeName}>> {`,
        `    return this.request<${m.resTypeName}>('${m.route.method}', \`${clientPath}\${toQuery(params as Record<string, unknown>)}\`, undefined, options)`,
        `  }`,
        '',
      )
    } else {
      const arg = m.reqTypeName ? `body: ${m.reqTypeName}` : 'body?: unknown'
      body.push(
        `  ${m.methodName}(${arg}, options?: AxiosRequestConfig): Promise<AxiosResponse<${m.resTypeName}>> {`,
        `    return this.request<${m.resTypeName}>('${m.route.method}', ${pathLiteral}, body, options)`,
        `  }`,
        '',
      )
    }
  }

  return header.join('\n') + '\n' + body.join('\n') + '}\n'
}

function valueLiteral(v: string | number | boolean | null): string {
  if (v === null) return 'null'
  return JSON.stringify(v)
}

function positivePayload(route: ScannedApiRoute): Record<string, string | number | boolean> {
  const payload: Record<string, string | number | boolean> = {}
  for (const f of route.fields) {
    // Always include required fields; include optional ones only when they look
    // meaningful to a positive request (keep it minimal + valid).
    if (f.required) payload[f.name] = smartValue(f.name, f.type)
  }
  // If nothing was required, still send smart values for any known fields.
  if (Object.keys(payload).length === 0) {
    for (const f of route.fields) payload[f.name] = smartValue(f.name, f.type)
  }
  return payload
}

function objectLiteral(payload: Record<string, string | number | boolean>): string {
  const entries = Object.entries(payload).map(([k, v]) => `${JSON.stringify(k)}: ${valueLiteral(v)}`)
  return `{ ${entries.join(', ')} }`
}

function buildSpec(
  domain: string,
  domainPascal: string,
  foundryProp: string,
  methods: RouteMethod[],
): { content: string; caseCount: number } {
  let caseCount = 0
  const testNames = new Set<string>()
  const uniqueTestName = (base: string): string => {
    let name = base
    let i = 2
    while (testNames.has(name)) name = `${base}${i++}`
    testNames.add(name)
    return name
  }

  const describes: string[] = []

  const call = (m: RouteMethod, arg: string, extra?: string) =>
    `await ${foundryProp}.${domainPascal}.${m.methodName}(${arg}${extra ? `, ${extra}` : ''})`

  for (const m of methods) {
    const route = m.route
    const cases: string[] = []
    const payload = positivePayload(route)
    const schemaName = `${camel(m.methodName)}ResponseSchema`

    // Positive — status + zod contract (schema file is the single source of truth)
    const posName = uniqueTestName(`${pascal(m.methodName)}Valid`)
    caseCount++
    cases.push(
      `  test('[${posName}] | verify that a valid request returns ${route.successStatus} with the expected body', async ({ ${foundryProp} }) => {`,
      `    await test.step('send a valid ${route.method} ${route.routePath} request', async () => {`,
      `      const res = ${call(m, objectLiteral(payload))}`,
      `      ApiAssertions.assertStatus(res, ${route.successStatus})`,
      `      ApiAssertions.assertSchema(res, ${schemaName})`,
      `    })`,
      `  })`,
      '',
    )

    // Negative: missing each required field → first error status (usually 400)
    const requiredFields = route.fields.filter((f) => f.required)
    const badStatus = route.errorStatuses[0] ?? 400
    for (const f of requiredFields) {
      const partial = { ...payload }
      delete partial[f.name]
      const name = uniqueTestName(`${pascal(m.methodName)}Missing${pascal(f.name)}`)
      caseCount++
      cases.push(
        `  test('[${name}] | verify that a request missing "${f.name}" returns ${badStatus}', async ({ ${foundryProp} }) => {`,
        `    await test.step('send ${route.method} ${route.routePath} without "${f.name}"', async () => {`,
        `      const res = ${call(m, `${objectLiteral(partial)} as never`, `withExpectedStatus(${badStatus})`)}`,
        `      ApiAssertions.assertStatus(res, ${badStatus})`,
        `    })`,
        `  })`,
        '',
      )
    }

    // Negative: wrong primitive type for a typed required field
    for (const f of requiredFields.filter((x) => x.type !== 'unknown')) {
      const bad = { ...payload, [f.name]: wrongTypeValue(f.type) }
      const name = uniqueTestName(`${pascal(m.methodName)}Invalid${pascal(f.name)}`)
      caseCount++
      cases.push(
        `  test('[${name}] | verify that an invalid "${f.name}" type returns ${badStatus}', async ({ ${foundryProp} }) => {`,
        `    await test.step('send ${route.method} ${route.routePath} with an invalid "${f.name}" type', async () => {`,
        `      const res = ${call(m, `${objectLiteral(bad)} as never`, `withExpectedStatus(${badStatus})`)}`,
        `      ApiAssertions.assertStatus(res, ${badStatus})`,
        `    })`,
        `  })`,
        '',
      )
    }

    describes.push(
      `test.describe('[${domainPascal}API] ${route.method} ${route.routePath}', () => {`,
      '',
      ...cases,
      `})`,
      '',
    )
  }

  const schemaImports = methods
    .map((m) => `${camel(m.methodName)}ResponseSchema`)
    .join(', ')

  const content = [
    `import { test } from '@domains/${domain}/${domain}.fixture'`,
    `import { ApiAssertions } from '@core/api/api-assertions'`,
    `import { withExpectedStatus } from '@core/api/axios-client'`,
    `import { ${schemaImports} } from '@domains/${domain}/${domain}.schemas'`,
    '',
    ...describes,
  ].join('\n')

  return { content: content.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', caseCount }
}

/** Idempotently register the new Api on FoundryAPI. */
function patchFoundry(automationRoot: string, domainPascal: string): boolean {
  const file = path.join(automationRoot, 'core/api/foundry-api.ts')
  let src = fs.readFileSync(file, 'utf-8')
  const apiName = `${domainPascal}Api`
  if (src.includes(`readonly ${domainPascal}:`)) return false

  // 1. import from generated
  src = src.replace(
    /(\n\s*ProductsApi,\n)/,
    `$1  ${apiName},\n`,
  )
  // fallback if the exact anchor changed
  if (!src.includes(apiName + ',')) {
    src = src.replace(
      /import \{([\s\S]*?)\} from '@core\/api\/generated'/,
      (full, inner: string) => `import {${inner}  ${apiName},\n} from '@core/api/generated'`,
    )
  }

  // 2. class field
  src = src.replace(
    /(readonly Products: ProductsApi\n)/,
    `$1  readonly ${domainPascal}: ${apiName}\n`,
  )
  // 3. constructor assignment
  src = src.replace(
    /(this\.Products = new ProductsApi\(config\)\n)/,
    `$1    this.${domainPascal} = new ${apiName}(config)\n`,
  )
  fs.writeFileSync(file, src, 'utf-8')
  return true
}

/** Idempotently export the new Api + model from the generated barrel. */
function patchGeneratedIndex(automationRoot: string, domain: string, domainPascal: string): boolean {
  const file = path.join(automationRoot, 'core/api/generated/index.ts')
  let src = fs.readFileSync(file, 'utf-8')
  let changed = false
  const apiExport = `export { ${domainPascal}Api } from './api/${domain}-api'`
  const modelExport = `export * from './model/${domain}'`
  if (!src.includes(apiExport)) {
    src = src.replace(
      /(export \{ ProductsApi \} from '.\/api\/products-api'\n)/,
      `$1${apiExport}\n`,
    )
    changed = true
  }
  if (!src.includes(modelExport)) {
    src = src.replace(/(export \* from '.\/model'\n?)/, `$1${modelExport}\n`)
    changed = true
  }
  if (changed) fs.writeFileSync(file, src, 'utf-8')
  return changed
}

export function generateApiArtifacts(opts: {
  automationRoot: string
  domain: string
  routes: ScannedApiRoute[]
  overwrite: boolean
}): ApiGenResult | undefined {
  const routes = opts.routes.filter((r) => r.routePath)
  if (routes.length === 0) return undefined

  const domain = opts.domain
  const domainPascal = pascal(domain)
  const foundryProp = 'foundryAPI'

  const used = new Set<string>()
  const methods: RouteMethod[] = routes.map((route) => {
    const methodName = methodNameFor(route, used)
    const isQuery = route.method === 'GET'
    const hasReqShape = route.fields.length > 0
    const reqTypeName = hasReqShape
      ? `${pascal(methodName)}${isQuery ? 'Query' : 'Request'}`
      : isQuery
        ? undefined
        : undefined
    return {
      route,
      methodName,
      resTypeName: `${pascal(methodName)}Response`,
      isQuery,
      ...(reqTypeName ? { reqTypeName } : {}),
    }
  })

  const modelPath = path.join(opts.automationRoot, `core/api/generated/model/${domain}.ts`)
  const clientPath = path.join(opts.automationRoot, `core/api/generated/api/${domain}-api.ts`)
  const schemaPath = path.join(opts.automationRoot, `domains/${domain}/${domain}.schemas.ts`)
  const specPath = path.join(opts.automationRoot, `suites/${domain}/${domain}.api.spec.ts`)

  fs.mkdirSync(path.dirname(modelPath), { recursive: true })
  fs.mkdirSync(path.dirname(clientPath), { recursive: true })
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true })
  fs.mkdirSync(path.dirname(specPath), { recursive: true })

  const modelExisted = fs.existsSync(modelPath)

  // Standard path: write/refresh generated model + client from app-scan.
  // When a pre-existing model is present and overwrite is false, keep it
  // (swagger / hand-maintained Foundry types) and only derive schemas from it.
  if (!modelExisted || opts.overwrite) {
    fs.writeFileSync(modelPath, buildModel(domainPascal, methods), 'utf-8')
    fs.writeFileSync(clientPath, buildClient(domainPascal, domain, methods), 'utf-8')
  }

  let fromModel: Map<string, ScannedSuccessField[]> | null = null
  let schemaSource: 'generated-model' | 'app-scan' = 'app-scan'
  if (fs.existsSync(modelPath)) {
    const parsed = parseGeneratedModelResponseTypes(fs.readFileSync(modelPath, 'utf-8'))
    const matched = methods.filter((m) => parsed.has(m.resTypeName)).length
    if (matched > 0) {
      fromModel = parsed
      schemaSource = 'generated-model'
    }
  }

  if (!fs.existsSync(schemaPath) || opts.overwrite) {
    fs.writeFileSync(schemaPath, buildSchemas(domain, methods, fromModel, schemaSource), 'utf-8')
  }

  const { content: specContent, caseCount } = buildSpec(domain, domainPascal, foundryProp, methods)
  if (!fs.existsSync(specPath) || opts.overwrite) {
    fs.writeFileSync(specPath, specContent, 'utf-8')
  }

  const patchedFoundry = patchFoundry(opts.automationRoot, domainPascal)
  const patchedIndex = patchGeneratedIndex(opts.automationRoot, domain, domainPascal)

  return {
    modelPath,
    clientPath,
    schemaPath,
    specPath,
    routeCount: routes.length,
    caseCount,
    patchedFoundry,
    patchedIndex,
    schemaSource,
  }
}
