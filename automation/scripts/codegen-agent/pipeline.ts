import * as path from 'node:path'
import { CodegenAdapter } from './codegen-adapter'
import { loadCodebaseInsights, mergeCodebaseSelectors, resolveRepoRoot } from './codebase-context'
import { FixtureWriter } from './fixture-writer'
import { toPageVar } from './page-name'
import { LocatorStrategy } from './locator-strategy'
import { PageAnalyser } from './page-analyser'
import { PageExplorer } from './page-explorer'
import { PomWriter } from './pom-writer'
import { SpecWriter } from './spec-writer'
import { TestPlanner } from './test-planner'
import { DesignedCaseMergeInput, mergeDesignCasesIntoPlan } from './design-case-merge'
import { GeneratorOptions } from './types'

export type { DesignedCaseMergeInput } from './design-case-merge'

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

  if (opts.explore) {
    const explorer = new PageExplorer()
    codegenFile = await explorer.explore({
      url: opts.url,
      headless: opts.headless,
      outputPath: DEFAULT_EXPLORE_OUTPUT,
      ...(opts.storageState ? { storageState: opts.storageState } : {}),
    })
  }

  const analyser = new PageAnalyser()
  const elementMap = await analyser.analyse(opts.url, opts.headless, opts.storageState)

  const strategy = new LocatorStrategy()
  let resolved = strategy.resolve(elementMap.elements)
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
