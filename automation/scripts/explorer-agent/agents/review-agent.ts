import { appendExploreAudit, nextExplorePhase } from '../state'
import { ExploreAgentResult } from './setup-agent'
import { ExploreOrchestratorOptions, ExploreSharedState } from '../types'

export async function runReviewAgent(
  state: ExploreSharedState,
  options: ExploreOrchestratorOptions,
): Promise<ExploreAgentResult> {
  const openCritical = state.defects.filter(
    (defect) => defect.triageStatus === 'open' && defect.severity === 'critical',
  )
  let next = { ...state }

  if (openCritical.length === 0) {
    next = appendExploreAudit(next, {
      phase: 'review',
      agent: 'review-agent',
      action: 'review_passed',
      reason: 'No open critical anomalies — human gate not required',
      confidence: 0.9,
    })
    return { nextPhase: nextExplorePhase('review', options.phases), state: next }
  }

  if (options.skipHumanGates) {
    next = {
      ...next,
      humanGates: [
        ...next.humanGates,
        {
          phase: 'review',
          status: 'skipped',
          reason: `--skip-human-gates: auto-acknowledged ${openCritical.length} critical finding(s)`,
          requiredFor: openCritical.map((defect) => defect.id),
        },
      ],
    }
    next = appendExploreAudit(next, {
      phase: 'review',
      agent: 'review-agent',
      action: 'human_gate_skipped',
      reason: `Auto-acknowledged ${openCritical.length} critical finding(s) via --skip-human-gates`,
      confidence: 0.7,
      inputs: { criticalIds: openCritical.map((defect) => defect.id) },
    })
    return { nextPhase: nextExplorePhase('review', options.phases), state: next }
  }

  next = {
    ...next,
    humanGates: [
      ...next.humanGates,
      {
        phase: 'review',
        status: 'pending',
        reason: `${openCritical.length} critical anomal(ies) require human review before treating the run as clear`,
        requiredFor: openCritical.map((defect) => defect.id),
      },
    ],
  }
  next = appendExploreAudit(next, {
    phase: 'review',
    agent: 'review-agent',
    action: 'awaiting_human_approval',
    reason:
      `${openCritical.length} critical finding(s) pending review — pipeline continues to reporting; ` +
      're-run with --skip-human-gates only when you intentionally accept the risk',
    confidence: 0.85,
    inputs: { criticalIds: openCritical.map((defect) => defect.id) },
  })

  return { nextPhase: nextExplorePhase('review', options.phases), state: next }
}
