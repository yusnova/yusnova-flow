/**
 * Application-under-test scanner.
 *
 * Unlike `codebase-scanner` (which inspects the automation repo itself), this
 * module points at the *live application's* source tree (via `--app-root`) and
 * extracts the concrete contract the tests must cover — no LLM required:
 *
 *  - REST API routes (Next.js App Router `app/api/** /route.ts`, Pages Router
 *    `pages/api/**`), including HTTP method, path, required body/query fields,
 *    observed error statuses and a success-response shape hint.
 *  - Form / interactive selectors (data-testid, data-test) grouped per screen.
 *  - Frontend→backend integration calls (fetch to /api/...).
 *
 * The output feeds the design agent (rich UI + API case synthesis) and the API
 * artifact generator (typed client + zod schema + spec).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ScannedField {
  name: string
  location: 'body' | 'query'
  required: boolean
  /** Inferred primitive type when the handler asserts one (typeof checks). */
  type: 'string' | 'number' | 'boolean' | 'unknown'
}

/** Top-level success response field with a best-effort JSON type. */
export interface ScannedSuccessField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown'
}

export interface ScannedApiRoute {
  method: HttpMethod
  /** Route path as called by the client, e.g. `/api/postcode/lookup`. */
  routePath: string
  filePath: string
  fields: ScannedField[]
  /** Distinct 4xx/5xx statuses the handler can return. */
  errorStatuses: number[]
  successStatus: number
  /** Top-level keys of the success response body (schema hint). */
  successKeys: string[]
  /** Typed success-response shape (drives zod schemas + assertSchema). */
  successFields: ScannedSuccessField[]
}

export interface ScannedSelector {
  testId: string
  attr: 'data-testid' | 'data-test'
  filePath: string
  /** Best-effort element role/kind hint from the surrounding tag. */
  kind: 'input' | 'button' | 'select' | 'link' | 'region' | 'unknown'
}

export interface AppScanResult {
  appRoot: string
  detected: boolean
  framework: 'next-app' | 'next-pages' | 'unknown'
  apiRoutes: ScannedApiRoute[]
  selectors: ScannedSelector[]
  fetchTargets: string[]
}

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.git', 'coverage', 'out'])
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx'])

function walk(dir: string, maxFiles = 2000): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  const stack = [dir]
  while (stack.length && out.length < maxFiles) {
    const cur = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (out.length >= maxFiles) break
      const abs = path.join(cur, e.name)
      let isDir = e.isDirectory()
      if (e.isSymbolicLink()) {
        try {
          isDir = fs.statSync(abs).isDirectory()
        } catch {
          continue
        }
      }
      if (isDir) {
        if (!SKIP_DIRS.has(e.name)) stack.push(abs)
        continue
      }
      if (SOURCE_EXT.has(path.extname(e.name))) out.push(abs)
    }
  }
  return out
}

function read(file: string): string {
  try {
    return fs.readFileSync(file, 'utf-8')
  } catch {
    return ''
  }
}

/** Derive `/api/...` from a Next.js App Router `route.ts` absolute path. */
function appRouterPath(absFile: string): string | undefined {
  const norm = absFile.replace(/\\/g, '/')
  const m = norm.match(/\/app\/(.+)\/route\.(?:ts|js|tsx|jsx)$/)
  if (!m) return undefined
  const segments = m[1]!
    .split('/')
    .filter(Boolean)
    .map((seg) => seg.replace(/^\[\.{3}(.+)\]$/, '{$1}').replace(/^\[(.+)\]$/, '{$1}'))
    // route groups like (marketing) are not part of the URL
    .filter((seg) => !/^\(.*\)$/.test(seg))
  return '/' + segments.join('/')
}

/** Derive `/api/...` from a Next.js Pages Router `pages/api/...` path. */
function pagesRouterPath(absFile: string): string | undefined {
  const norm = absFile.replace(/\\/g, '/')
  const m = norm.match(/\/pages\/(api\/.+)\.(?:ts|js|tsx|jsx)$/)
  if (!m) return undefined
  let route = m[1]!.replace(/\/index$/, '')
  route = route
    .split('/')
    .map((seg) => seg.replace(/^\[\.{3}(.+)\]$/, '{$1}').replace(/^\[(.+)\]$/, '{$1}'))
    .join('/')
  return '/' + route
}

function extractExportedMethods(src: string): HttpMethod[] {
  const methods = new Set<HttpMethod>()
  const fnRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g
  const constRe = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g
  for (const m of src.matchAll(fnRe)) methods.add(m[1] as HttpMethod)
  for (const m of src.matchAll(constRe)) methods.add(m[1] as HttpMethod)
  return [...methods]
}

/** Isolate a single exported handler body (best effort) via brace matching. */
function methodBody(src: string, method: HttpMethod): string {
  const startRe = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`)
  const start = src.search(startRe)
  if (start === -1) return src
  const braceStart = src.indexOf('{', start)
  if (braceStart === -1) return src
  let depth = 0
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(braceStart, i + 1)
    }
  }
  return src.slice(braceStart)
}

function inferType(body: string, field: string): ScannedField['type'] {
  if (new RegExp(`typeof\\s+\\w*\\.?${field}\\s*!==\\s*["']number["']`).test(body)) return 'number'
  if (new RegExp(`typeof\\s+\\w*\\.?${field}\\s*!==\\s*["']boolean["']`).test(body)) return 'boolean'
  if (new RegExp(`typeof\\s+\\w*\\.?${field}\\s*!==\\s*["']string["']`).test(body)) return 'string'
  if (new RegExp(`${field}\\s*===\\s*["']true["']`).test(body)) return 'boolean'
  return 'unknown'
}

/**
 * Collect body/query fields from a handler body and decide which are required.
 * A field is required when it participates in a guard that returns a 4xx.
 */
function extractFields(body: string): ScannedField[] {
  const fields = new Map<string, ScannedField>()

  // local variable → body/query field aliases (e.g. `const raw = body.postcode`)
  const alias = new Map<string, { name: string; location: 'body' | 'query' }>()
  for (const m of body.matchAll(/const\s+(\w+)\s*=\s*body\.(\w+)/g)) {
    alias.set(m[1]!, { name: m[2]!, location: 'body' })
  }
  for (const m of body.matchAll(/const\s+(\w+)\s*=\s*searchParams\.get\(\s*["'](\w+)["']/g)) {
    alias.set(m[1]!, { name: m[2]!, location: 'query' })
  }

  const register = (name: string, location: 'body' | 'query') => {
    if (!fields.has(name)) {
      fields.set(name, { name, location, required: false, type: inferType(body, name) })
    }
  }

  for (const m of body.matchAll(/\bbody\.(\w+)\b/g)) register(m[1]!, 'body')
  for (const m of body.matchAll(/searchParams\.get\(\s*["'](\w+)["']/g)) register(m[1]!, 'query')
  // destructured body: const { a, b } = body
  for (const m of body.matchAll(/const\s*\{([^}]+)\}\s*=\s*body\b/g)) {
    for (const raw of m[1]!.split(',')) {
      const name = raw.trim().split(':')[0]!.trim()
      if (name) register(name, 'body')
    }
  }

  // Guard detection: for every `status: 4xx` response, find the nearest
  // preceding `if (<cond>)` and mark the fields referenced in that condition as
  // required. Paren-matching keeps nested object braces (NextResponse.json({...}))
  // from breaking the extraction.
  const markRequired = (cond: string) => {
    for (const idMatch of cond.matchAll(/\b([a-zA-Z_]\w*)\b/g)) {
      const id = idMatch[1]!
      const resolved = alias.get(id)
      if (resolved) {
        register(resolved.name, resolved.location)
        fields.get(resolved.name)!.required = true
      } else if (fields.has(id)) {
        fields.get(id)!.required = true
      }
    }
    for (const bm of cond.matchAll(/body\.(\w+)/g)) {
      register(bm[1]!, 'body')
      fields.get(bm[1]!)!.required = true
    }
    for (const qm of cond.matchAll(/searchParams\.get\(\s*["'](\w+)["']/g)) {
      register(qm[1]!, 'query')
      fields.get(qm[1]!)!.required = true
    }
  }

  for (const statusMatch of body.matchAll(/status:\s*4\d\d/g)) {
    const window = body.slice(Math.max(0, statusMatch.index! - 400), statusMatch.index!)
    const ifPositions = [...window.matchAll(/if\s*\(/g)]
    const lastIf = ifPositions[ifPositions.length - 1]
    if (!lastIf) continue
    const parenStart = window.indexOf('(', lastIf.index!)
    let depth = 0
    let cond = ''
    for (let i = parenStart; i < window.length; i++) {
      const ch = window[i]!
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) break
      }
      if (depth >= 1 && !(depth === 1 && ch === '(')) cond += ch
    }
    markRequired(cond)
  }

  return [...fields.values()]
}

function extractErrorStatuses(body: string): number[] {
  const statuses = new Set<number>()
  for (const m of body.matchAll(/status:\s*(\d{3})/g)) {
    const code = Number(m[1])
    if (code >= 400) statuses.add(code)
  }
  return [...statuses].sort((a, b) => a - b)
}

function inferSuccessValueType(valueExpr: string): ScannedSuccessField['type'] {
  const v = valueExpr.trim()
  if (!v) return 'unknown'
  if (/^["'`]/.test(v)) return 'string'
  if (/^(true|false)\b/.test(v)) return 'boolean'
  if (/^-?\d+(\.\d+)?\b/.test(v)) return 'number'
  if (v.startsWith('[')) return 'array'
  if (v.startsWith('{')) return 'object'
  // Plural identifier shorthand / variable often means a list payload.
  if (/^[a-zA-Z_]\w*s$/i.test(v) && !/status|address|success/i.test(v)) return 'array'
  return 'unknown'
}

function inferSuccessTypeFromName(name: string, fallback: ScannedSuccessField['type']): ScannedSuccessField['type'] {
  if (fallback !== 'unknown') return fallback
  if (/^(ok|success|enabled|active)$/i.test(name)) return 'boolean'
  if (/(addresses|skips|items|results|list|entries)$/i.test(name)) return 'array'
  if (/(count|total|amount|price|qty|quantity|page|size)$/i.test(name)) return 'number'
  if (/(id|token|status|email|name|message|code|url|path|postcode)$/i.test(name)) return 'string'
  return 'unknown'
}

/** Top-level keys + inferred types of the first non-error NextResponse.json({...}) success payload. */
function extractSuccessShape(body: string): ScannedSuccessField[] {
  const re = /(?:NextResponse\.json|Response\.json|res\.json)\(\s*\{/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body))) {
    const objStart = body.indexOf('{', match.index)
    if (objStart === -1) continue
    let depth = 0
    let end = objStart
    for (let i = objStart; i < body.length; i++) {
      if (body[i] === '{') depth++
      else if (body[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    const obj = body.slice(objStart, end + 1)
    if (/\berror\b\s*:/.test(obj)) continue // skip error payloads
    if (/status:\s*[45]\d\d/.test(body.slice(end, end + 40))) continue

    const fields: ScannedSuccessField[] = []
    const seen = new Set<string>()
    let d = 0
    let segment = ''
    const inner = obj.slice(1, -1)
    const flush = () => {
      const trimmed = segment.trim()
      if (!trimmed) {
        segment = ''
        return
      }
      const colon = trimmed.indexOf(':')
      let name: string
      let valueExpr = ''
      if (colon === -1) {
        name = trimmed.replace(/['"]/g, '')
      } else {
        name = trimmed.slice(0, colon).trim().replace(/['"]/g, '')
        valueExpr = trimmed.slice(colon + 1).trim()
      }
      if (!/^[a-zA-Z_]\w*$/.test(name) || seen.has(name)) {
        segment = ''
        return
      }
      seen.add(name)
      const rawType = colon === -1 ? inferSuccessValueType(name) : inferSuccessValueType(valueExpr)
      fields.push({ name, type: inferSuccessTypeFromName(name, rawType) })
      segment = ''
    }
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i]!
      if (ch === '{' || ch === '[' || ch === '(') d++
      else if (ch === '}' || ch === ']' || ch === ')') d--
      if (d === 0 && ch === ',') flush()
      else segment += ch
    }
    flush()
    if (fields.length > 0) return fields
  }
  return []
}

function tagKind(context: string): ScannedSelector['kind'] {
  const before = context.toLowerCase()
  if (/<input|<textarea/.test(before)) return 'input'
  if (/<button|role=["']button["']/.test(before)) return 'button'
  if (/<select/.test(before)) return 'select'
  if (/<a[\s>]/.test(before)) return 'link'
  if (/<(section|div|main|form|fieldset)/.test(before)) return 'region'
  return 'unknown'
}

function extractSelectors(src: string, filePath: string): ScannedSelector[] {
  const out: ScannedSelector[] = []
  const push = (testId: string, attr: ScannedSelector['attr'], index: number) => {
    if (testId.includes('${') || testId.includes('{')) return // dynamic template — skip
    const start = Math.max(0, index - 120)
    out.push({ testId, attr, filePath, kind: tagKind(src.slice(start, index)) })
  }
  for (const m of src.matchAll(/data-testid=["']([^"'{}]+)["']/g)) push(m[1]!, 'data-testid', m.index ?? 0)
  for (const m of src.matchAll(/data-test=["']([^"'{}]+)["']/g)) push(m[1]!, 'data-test', m.index ?? 0)
  return out
}

function extractFetchTargets(src: string): string[] {
  const out = new Set<string>()
  for (const m of src.matchAll(/fetch\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    const url = m[1]!
    if (url.startsWith('/api') || url.includes('/api/')) {
      out.add(url.replace(/\$\{[^}]+\}/g, '{param}').split('?')[0]!)
    }
  }
  return [...out]
}

/**
 * Resolve the application-under-test source root without requiring --app-root.
 * Priority: explicit CLI → STLC_APP_ROOT → nearby trees that contain App/Pages API routes
 * (prefers sibling `frontend/` next to `automation/`).
 */
function looksLikeAppRoot(dir: string): boolean {
  if (!dir || !fs.existsSync(dir)) return false
  return (
    fs.existsSync(path.join(dir, 'app', 'api'))
    || fs.existsSync(path.join(dir, 'pages', 'api'))
    || fs.existsSync(path.join(dir, 'src', 'app', 'api'))
    || fs.existsSync(path.join(dir, 'src', 'pages', 'api'))
  )
}

/** Prefer FE trees (selectors + API symlink) over API-only backend copies. */
function rankAppRoot(dir: string): number {
  const base = path.basename(dir).toLowerCase()
  let score = 0
  if (base === 'frontend' || base === 'ui' || base === 'web' || base === 'app') score += 10
  if (base === 'backend' || base === 'api' || base === 'server') score -= 5
  if (fs.existsSync(path.join(dir, 'components')) || fs.existsSync(path.join(dir, 'app', 'page.tsx'))) {
    score += 5
  }
  return score
}

export function resolveAppUnderTestRoot(opts: {
  explicit?: string | undefined
  domain?: string | undefined
  searchFrom?: string[] | undefined
}): string | undefined {
  const explicit = opts.explicit?.trim() || process.env.STLC_APP_ROOT?.trim()
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit)

  const domain = (opts.domain ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '')
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
  const searchFrom = opts.searchFrom ?? [process.cwd()]

  const candidates: string[] = []
  for (const base of searchFrom) {
    candidates.push(
      path.resolve(base),
      path.resolve(base, 'ui'),
      path.resolve(base, 'frontend'),
      path.resolve(base, '../frontend'),
      path.resolve(base, '../../frontend'),
      path.resolve(base, '..'),
      path.resolve(base, '../ui'),
      path.resolve(base, `../${domain}`),
      path.resolve(base, `../${domain}/ui`),
      path.resolve(base, '../../booking/ui'),
      path.resolve(base, '../booking/ui'),
    )
  }
  if (home) {
    candidates.push(
      path.join(home, 'Desktop', 'dev', 'yusnova-flow', 'frontend'),
      path.join(home, 'Desktop', 'booking', 'ui'),
      path.join(home, 'Desktop', domain, 'ui'),
      path.join(home, 'Desktop', domain),
      path.join(home, 'Projects', domain, 'ui'),
    )
  }

  // One-level sibling scan under Desktop/dev parents for * /ui with app/api
  for (const base of searchFrom) {
    const parent = path.resolve(base, '..')
    try {
      for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        candidates.push(path.join(parent, entry.name, 'ui'), path.join(parent, entry.name))
      }
    } catch {
      // ignore
    }
  }

  const seen = new Set<string>()
  const matches: string[] = []
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    if (looksLikeAppRoot(resolved)) matches.push(resolved)
  }

  matches.sort((a, b) => rankAppRoot(b) - rankAppRoot(a))
  return matches[0]
}

export function scanAppUnderTest(appRoot: string): AppScanResult {
  const empty: AppScanResult = {
    appRoot,
    detected: false,
    framework: 'unknown',
    apiRoutes: [],
    selectors: [],
    fetchTargets: [],
  }
  if (!appRoot || !fs.existsSync(appRoot)) return empty

  const files = walk(appRoot)
  if (files.length === 0) return empty

  const apiRoutes: ScannedApiRoute[] = []
  const selectors: ScannedSelector[] = []
  const fetchTargets = new Set<string>()
  let framework: AppScanResult['framework'] = 'unknown'

  for (const file of files) {
    const norm = file.replace(/\\/g, '/')
    const isAppRoute = /\/app\/.+\/route\.(ts|js|tsx|jsx)$/.test(norm)
    const isPagesRoute = /\/pages\/api\/.+\.(ts|js|tsx|jsx)$/.test(norm)
    const src = read(file)
    if (!src) continue

    for (const t of extractFetchTargets(src)) fetchTargets.add(t)

    if (isAppRoute || isPagesRoute) {
      const routePath = isAppRoute ? appRouterPath(file) : pagesRouterPath(file)
      if (!routePath) continue
      framework = isAppRoute ? 'next-app' : framework === 'unknown' ? 'next-pages' : framework

      const methods = isAppRoute
        ? extractExportedMethods(src)
        : (['GET', 'POST'] as HttpMethod[]).filter((m) => src.includes(m))

      for (const method of methods.length ? methods : (['GET'] as HttpMethod[])) {
        const body = isAppRoute ? methodBody(src, method) : src
        const successFields = extractSuccessShape(body)
        apiRoutes.push({
          method,
          routePath,
          filePath: norm,
          fields: extractFields(body),
          errorStatuses: extractErrorStatuses(body),
          successStatus: 200,
          successFields,
          successKeys: successFields.map((f) => f.name),
        })
      }
      continue
    }

    // Component / screen file — harvest selectors.
    if (/\.(tsx|jsx)$/.test(norm)) {
      selectors.push(...extractSelectors(src, norm))
    }
  }

  // de-dupe selectors by testId
  const seenSel = new Set<string>()
  const dedupSelectors = selectors.filter((s) => {
    if (seenSel.has(s.testId)) return false
    seenSel.add(s.testId)
    return true
  })

  return {
    appRoot,
    detected: apiRoutes.length > 0 || dedupSelectors.length > 0,
    framework,
    apiRoutes,
    selectors: dedupSelectors,
    fetchTargets: [...fetchTargets],
  }
}
