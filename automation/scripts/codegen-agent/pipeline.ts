import * as path from 'node:path'
import { CodegenAdapter } from '@codegen-agent/writers/codegen-adapter'
import { loadCodebaseInsights, mergeCodebaseSelectors, resolveRepoRoot } from '@codegen-agent/utils/codebase-context'
import { mergeElementInfos } from '@codegen-agent/dom/dom-scanner'
import { FixtureWriter } from '@codegen-agent/writers/fixture-writer'
import { toPageVar } from '@codegen-agent/naming/page-name'
import { LocatorStrategy } from '@codegen-agent/locators/locator-strategy'
import { PageAnalyser } from '@codegen-agent/dom/page-analyser'
import { PageExplorer } from '@codegen-agent/dom/page-explorer'
import { PomWriter } from '@codegen-agent/writers/pom-writer'
import { SpecWriter } from '@codegen-agent/writers/spec-writer'
import { TestPlanner } from '@codegen-agent/planning/test-planner'
import { DesignedCaseMergeInput, mergeDesignCasesIntoPlan } from '@codegen-agent/planning/design-case-merge'
import { GeneratorOptions, ElementInfo } from './types'

export type { DesignedCaseMergeInput } from '@codegen-agent/planning/design-case-merge'

export const AUTOMATION_ROOT = path.resolve(__dirname, '..', '..')
export const DEFAULT_EXPLORE_OUTPUT = path.join(AUTOMATION_ROOT, 'tmp/codegen-raw.ts')

export interface CodegenPipelineContext {
  designedCases?: DesignedCaseMergeInput[]
}

export interface CodegenPipelineResult {
  pomPath: string
  fixturePath: string
  specPath: string
  totalCases: number
  scaffoldCases: number
  addedDesignedCases: number
  coveredDesignedCases: number
  lowConfidenceCount: number
  pattern: string
  codegenFile?: string
}

export async function runCodegenPipeline(
  opts: GeneratorOptions,
  context: CodegenPipelineContext = {},
): Promise<CodegenPipelineResult> {
  let codegenFile = opts.codegenFile
  let exploreElements: ElementInfo[] = []

  if (opts.explore) {
    const explorer = new PageExplorer()
    const exploreResult = await explorer.explore({
      url: opts.url,
      headless: opts.headless,
      outputPath: DEFAULT_EXPLORE_OUTPUT,
      ...(opts.storageState ? { storageState: opts.storageState } : {}),
    })
    codegenFile = exploreResult.outputPath
    exploreElements = exploreResult.discoveredElements
  }

  const analyser = new PageAnalyser()
  const elementMap = await analyser.analyse(opts.url, opts.headless, opts.storageState)
  const mergedElements = mergeElementInfos(elementMap.elements, exploreElements)

  const strategy = new LocatorStrategy()
  let resolved = strategy.resolve(mergedElements)
  const repoRoot = resolveRepoRoot(AUTOMATION_ROOT)
  const codebase = loadCodebaseInsights(repoRoot, opts.domain)
  resolved = mergeCodebaseSelectors(resolved, codebase.selectors, opts.domain)
  const lowConfidenceCount = resolved.filter((e) => e.locator.confidence === 'low').length

  const planner = new TestPlanner()
  let plan = planner.generate({
    pageName: opts.page,
    domain: opts.domain,
    url: opts.url,
    elements: resolved,
  })

  let scaffoldCases = plan.testGroups.reduce((sum, g) => sum + g.cases.length, 0)
  let addedDesignedCases = 0
  let coveredDesignedCases = 0

  if (context.designedCases && context.designedCases.length > 0) {
    const mergeResult = mergeDesignCasesIntoPlan(plan, context.designedCases)
    plan = mergeResult.plan
    scaffoldCases = mergeResult.scaffoldCaseCount
    addedDesignedCases = mergeResult.addedDesignedIds.length
    coveredDesignedCases = mergeResult.coveredDesignedIds.length
  }

  const totalCases = plan.testGroups.reduce((sum, g) => sum + g.cases.length, 0)

  const pageVar = toPageVar(opts.page)
  const adapter = new CodegenAdapter()
  const codegenActions = await adapter.run({
    url: opts.url,
    elements: resolved,
    attemptCodegen: !opts.explore && !opts.noCodegen && !codegenFile,
    pageVar,
    ...(codegenFile ? { codegenFile } : {}),
  })

  const pomWriter = new PomWriter()
  const pomPath = await pomWriter.write({
    pageName: opts.page,
    domain: opts.domain,
    url: opts.url,
    elements: resolved,
    pattern: plan.pattern,
    automationRoot: AUTOMATION_ROOT,
    overwrite: opts.overwrite,
  })

  const fixtureWriter = new FixtureWriter()
  const fixturePath = await fixtureWriter.write({
    domain: opts.domain,
    pageClassName: opts.page,
    automationRoot: AUTOMATION_ROOT,
    overwrite: opts.overwrite,
  })

  const specWriter = new SpecWriter()
  const specPath = await specWriter.write({
    plan,
    testType: opts.type,
    codegenActions,
    automationRoot: AUTOMATION_ROOT,
    overwrite: opts.overwrite,
  })

  return {
    pomPath,
    fixturePath,
    specPath,
    totalCases,
    scaffoldCases,
    addedDesignedCases,
    coveredDesignedCases,
    lowConfidenceCount,
    pattern: plan.pattern,
    ...(codegenFile ? { codegenFile } : {}),
  }
}
