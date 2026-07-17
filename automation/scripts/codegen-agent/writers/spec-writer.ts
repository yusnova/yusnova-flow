import * as fs from 'node:fs'
import * as path from 'node:path'
import Handlebars from 'handlebars'
import { SPEC_TEMPLATE } from '../templates/spec.template'
import { consolidateTestGroups } from '@codegen-agent/planning/describe-groups'
import { mergeSpecPreservingManual, tagGeneratedSpec } from '@codegen-agent/planning/spec-merge'
import { toTestName } from '@codegen-agent/naming/test-naming'
import { toPageVar } from '@codegen-agent/naming/page-name'
import type { CodegenAction } from '../types'
import {
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

    // Explore/codegen-raw clicks are discovery-only — never inject them into the
    // first test (that produced clickBySelector noise and poisoned happy paths).
    void opts.codegenActions

    const groups = consolidateTestGroups(plan.testGroups).map((group) =>
      this.buildGroupData(group, pageVar, testType),
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

  private buildGroupData(
    group: TestGroup,
    pageVar: string,
    testType: TestType,
  ): SpecGroupData {
    const requiresApiSetup = group.requiresApiSetup || testType === 'e2e'
    const apiEndpoint = group.apiEndpoint || `/${pageVar.replace('Page', 's').toLowerCase()}`

    const cases: SpecCaseData[] = group.cases.map((tc) => {
      const steps = tc.steps.map((step) => ({
        description: step.description,
        lines: step.code,
      }))

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
