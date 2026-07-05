import { appendAudit } from '../state/pipeline-state'
import { AgentResult, OrchestratorOptions, QualityGate, StlcSharedState } from '../types'

export async function runReportingAgent(
  state: StlcSharedState,
  _options: OrchestratorOptions,
): Promise<AgentResult> {
  const totalAc = state.acceptanceCriteria.filter((ac) => ac.testable).length
  const coveredAc = state.acceptanceCriteria.filter(
    (ac) => ac.testable && ac.mappedTestCaseIds.length > 0,
  ).length
  const coveragePercent = totalAc === 0 ? 100 : Math.round((coveredAc / totalAc) * 100)

  const openP0 = state.defects.filter(
    (defect) => defect.severity === 'blocker' || defect.severity === 'critical',
  ).length

  const pendingHuman = state.humanGates.filter((gate) => gate.status === 'pending').length
  const blockingReasons: string[] = []

  if (openP0 > 0) blockingReasons.push(`${openP0} open P0/P1 defect(s)`)
  if (coveragePercent < 90) blockingReasons.push(`Coverage ${coveragePercent}% below 90% target`)
  if (pendingHuman > 0) blockingReasons.push(`${pendingHuman} human gate(s) pending`)
  if (
    state.auditTrail.some((entry) => entry.action === 'blocked_codegen')
    && !state.codegenArtifacts
  ) {
    blockingReasons.push('Codegen skipped: no approved test cases after design review')
  }
  if (state.ambiguityFlags.length > 2) {
    blockingReasons.push(`${state.ambiguityFlags.length} requirement ambiguity flags`)
  }
  if (state.healingProposals?.some((proposal) => proposal.status === 'pending_human')) {
    blockingReasons.push('Pending self-healing proposals require human approval')
  }

  const decision: QualityGate['decision'] =
    blockingReasons.length === 0 ? 'go' : openP0 > 0 ? 'no_go' : 'conditional'

  const recommendation = decision === 'go'
    ? 'Recommend proceed: quality signals within thresholds. Human sign-off still advised for production.'
    : decision === 'no_go'
      ? 'Recommend block release until P0 defects and human gates are resolved.'
      : 'Recommend conditional proceed after human review of flagged items.'

  const qualityGate: QualityGate = {
    decision,
    blockingReasons,
    coveragePercent,
    openP0Count: openP0,
    recommendation,
    confidence: blockingReasons.length === 0 ? 0.88 : 0.72,
  }

  const next = appendAudit(
    {
      ...state,
      qualityGate,
      currentPhase: 'done',
    },
    {
      phase: 'reporting',
      agent: 'reporting-agent',
      action: 'quality_gate_recommendation',
      reason: recommendation,
      confidence: qualityGate.confidence,
      inputs: { decision, coveragePercent, openP0 },
    },
  )

  return { nextPhase: 'done', state: next }
}
