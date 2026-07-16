import * as fs from 'node:fs'
import * as path from 'node:path'
import Handlebars from 'handlebars'
import { SPEC_TEMPLATE } from '../templates/spec.template'
import { consolidateTestGroups } from '@codegen-agent/planning/describe-groups'
import { mergeSpecPreservingManual, tagGeneratedSpec } from '@codegen-agent/planning/spec-merge'
import { toTestName } from '@codegen-agent/naming/test-naming'
import { toPageVar } from '@codegen-agent/naming/page-name'
import {
  CodegenAction,
  SpecCaseData,
  SpecGroupData,
  SpecTemplateData,
  TestGroup,
  TestPlan,
  TestType,
} from '../types'

const hbs = Handlebars.create()
hbs.registerHelper('cap', (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : ''))

const TEST_TYPE_LABELS: Record<TestType, string> = {
  ui: 'UI',
  api: 'API',
  e2e: 'E2E',
}

export class SpecWriter {
  async write(opts: {
    plan: TestPlan
    testType: TestType
    codegenActions: CodegenAction[]
    automationRoot: string
    overwrite: boolean
  }): Promise<string> {
    const { plan, testType } = opts
    const pageVar = toPageVar(plan.pageName)
    const specDir = path.join(opts.automationRoot, 'suites', plan.domain)
    const fileName = `${plan.domain}.${testType}.spec.ts`
    const outPath = path.join(specDir, fileName)

    if (fs.existsSync(outPath) && !opts.overwrite) {
      throw new Error(`Spec already exists: ${outPath} (use --overwrite to replace)`)
    }

    const groups = this.annotateWithCodegen(
      consolidateTestGroups(plan.testGroups),
      opts.codegenActions,
      pageVar,
      testType,
    )
    const data: SpecTemplateData = {
      domain: plan.domain,
      pageName: plan.pageName,
      pageVar,
      fixtureImport: `@domains/${plan.domain}/${plan.domain}.fixture`,
      testTypeLabel: TEST_TYPE_LABELS[testType],
      groups,
    }

    const compiled = hbs.compile(SPEC_TEMPLATE)
    let content = cleanWhitespace(compiled(data))
    content = tagGeneratedSpec(content)

    fs.mkdirSync(specDir, { recursive: true })
    if (fs.existsSync(outPath) && opts.overwrite) {
      const existing = fs.readFileSync(outPath, 'utf-8')
      content = mergeSpecPreservingManual(existing, content)
    }

    fs.writeFileSync(outPath, content, 'utf-8')
    return outPath
  }

  private annotateWithCodegen(
    groups: TestGroup[],
    codegenActions: CodegenAction[],
    pageVar: string,
    testType: TestType,
  ): SpecGroupData[] {
    return groups.map((g, gi) =>
      this.buildGroupData(g, gi === 0 ? codegenActions : [], pageVar, testType),
    )
  }

  private buildGroupData(
    group: TestGroup,
    codegenActions: CodegenAction[],
    pageVar: string,
    testType: TestType,
  ): SpecGroupData {
    const requiresApiSetup = group.requiresApiSetup || testType === 'e2e'
    const apiEndpoint = group.apiEndpoint || `/${pageVar.replace('Page', 's').toLowerCase()}`

    const cases: SpecCaseData[] = group.cases.map((tc, ci) => {
      const steps = tc.steps.map((step) => ({
        description: step.description,
        lines: step.code,
      }))

      if (ci === 0 && codegenActions.length > 0) {
        const codegenLines = codegenActions
          .filter((a) => !a.isRemoved)
          .map((a) => a.transformed)
          .filter((line) => !/^\s*test\s*\(/.test(line))
          .filter((line) => !/^\s*\}\);?\s*$/.test(line))
          .filter((line, index, all) => {
            if (!/\.page\.goto\(/.test(line)) return true
            const firstGoto = all.findIndex((entry) => /\.page\.goto\(/.test(entry))
            return index === firstGoto
          })

        if (steps[0] && codegenLines.length > 0) {
          steps[0] = { ...steps[0], lines: [...steps[0].lines, ...codegenLines] }
        }
      }

      return {
        id: tc.id,
        title: tc.title,
        testName: toTestName(tc.title),
        fixtures: this.resolveFixtures(tc.fixtures, testType, requiresApiSetup),
        steps,
        ...(tc.fixme ? { fixme: true } : {}),
      }
    })

    return {
      groupName: group.groupName,
      requiresApiSetup,
      apiSetupDescription: group.apiSetupDescription || `Create ${pageVar} entity via API`,
      apiEndpoint,
      stateKey: group.stateKey || `${pageVar}Entity`,
      cases,
    }
  }

  private resolveFixtures(fixtures: string, testType: TestType, requiresApiSetup: boolean): string {
    const parts = new Set(fixtures.split(',').map((s) => s.trim()).filter(Boolean))

    if (testType === 'e2e' || requiresApiSetup) {
      parts.add('foundryAPI')
      parts.add('state')
    }
    if (testType === 'api') {
      parts.add('foundryAPI')
    }

    return Array.from(parts).join(', ')
  }
}

function cleanWhitespace(raw: string): string {
  return raw.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
