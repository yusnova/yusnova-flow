import * as path from 'node:path'
import {
  DesignedCaseMergeInput,
  runCodegenPipeline,
} from '../../codegen-agent/pipeline'
import { generateApiArtifacts } from '../api-gen/api-artifact-writer'
import { appendAudit } from '../state/pipeline-state'
import { AgentResult, DesignedTestCase, OrchestratorOptions, StlcSharedState } from '../types'

const AUTOMATION_ROOT = path.resolve(__dirname, '..', '..', '..')

function toMergeInput(state: StlcSharedState, cases: DesignedTestCase[]): DesignedCaseMergeInput[] {
  return cases.map((testCase) => ({
    id: testCase.id,
    title: testCase.title,
    type: testCase.type,
    level: testCase.level,
    acceptanceCriteriaIds: testCase.acceptanceCriteriaIds,
    acTexts: testCase.acceptanceCriteriaIds
      .map((acId) => state.acceptanceCriteria.find((ac) => ac.id === acId)?.text ?? '')
      .filter(Boolean),
    steps: testCase.steps,
  }))
}

export async function runCodegenBridgeAgent(
  state: StlcSharedState,
  options: OrchestratorOptions,
): Promise<AgentResult> {
  const approvedCases = state.testCases.filter(
    (testCase) => testCase.status === 'approved' || testCase.status === 'automated',
  )

  if (approvedCases.length === 0) {
    const blocked = appendAudit(
      { ...state, currentPhase: 'reporting' },
      {
        phase: 'codegen',
        agent: 'codegen-bridge-agent',
        action: 'blocked_codegen',
        reason:
          'Codegen skipped — no approved test cases (human gate pending). Browser did not open. Re-run with --skip-human-gates or approve cases in state.json',
        confidence: 1,
      },
    )
    return { nextPhase: 'reporting', state: blocked }
  }

  const mergeInput = toMergeInput(state, approvedCases)
  const result = await runCodegenPipeline(options.codegen, { designedCases: mergeInput })

  const mergeNote =
    result.addedDesignedCases > 0 || result.coveredDesignedCases > 0
      ? ` (${result.scaffoldCases} scaffold, ${result.coveredDesignedCases} design covered, ${result.addedDesignedCases} design added)`
      : ` (${result.scaffoldCases} scaffold cases)`

  // API artifact generation (foundry client + model + schema + spec) from the
  // scanned application-under-test routes. Runs whenever the app exposes an API.
  let apiNote = ''
  const apiRoutes = state.appInsights?.apiRoutes ?? []
  if (apiRoutes.length > 0) {
    try {
      const apiResult = generateApiArtifacts({
        automationRoot: AUTOMATION_ROOT,
        domain: options.codegen.domain,
        routes: apiRoutes,
        overwrite: options.codegen.overwrite,
      })
      if (apiResult) {
        apiNote = ` + API: ${apiResult.routeCount} route(s), ${apiResult.caseCount} case(s), schemas←${apiResult.schemaSource} → ${apiResult.specPath.replace(`${AUTOMATION_ROOT}/`, '')}`
      }
    } catch (error) {
      apiNote = ` (API generation skipped: ${error instanceof Error ? error.message : String(error)})`
    }
  }

  const next = appendAudit(
    {
      ...state,
      codegenArtifacts: {
        pomPath: result.pomPath,
        fixturePath: result.fixturePath,
        specPath: result.specPath,
        totalCases: result.totalCases,
        pattern: result.pattern,
      },
      currentPhase: 'review_code',
    },
    {
      phase: 'codegen',
      agent: 'codegen-bridge-agent',
      action: 'generated_artifacts',
      reason: `Wrote POM, fixture, and spec via codegen pipeline${mergeNote}${apiNote}`,
      confidence: result.lowConfidenceCount === 0 ? 0.9 : 0.7,
      inputs: {
        lowConfidenceCount: result.lowConfidenceCount,
        scaffoldCases: result.scaffoldCases,
        addedDesignedCases: result.addedDesignedCases,
        coveredDesignedCases: result.coveredDesignedCases,
        apiRouteCount: apiRoutes.length,
      },
    },
  )

  return { nextPhase: 'review_code', state: next }
}
