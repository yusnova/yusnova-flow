import { appendExploreAudit, nextExplorePhase } from '../state'
import { ExploreAgentResult } from './setup-agent'
import { Anomaly, ExploreOrchestratorOptions, ExploreSharedState } from '../types'

function triageStatusFor(anomaly: Anomaly): 'open' | 'noise' {
  // Visible validation / empty-submit copy is a common false positive on form-heavy apps.
  if (
    anomaly.type === 'error_text_on_page' &&
    /please enter|required|invalid|must be|try again|valid .+ postcode|enter a valid|something went wrong/i.test(
      anomaly.evidence,
    )
  ) {
    return 'noise'
  }
  return 'open'
}

export async function runTriageAgent(
  state: ExploreSharedState,
  options: ExploreOrchestratorOptions,
): Promise<ExploreAgentResult> {
  const defects = state.anomalies.map((anomaly) => ({
    id: `EXPLORE-${state.runId}-${anomaly.id}`,
    title: `${anomaly.description} (${anomaly.pageUrl})`,
    severity: anomaly.severity,
    triageStatus: triageStatusFor(anomaly) as 'open' | 'noise' | 'confirmed',
    rootCauseHypothesis: anomaly.evidence.slice(0, 200),
    anomalyId: anomaly.id,
  }))

  const open = defects.filter((defect) => defect.triageStatus === 'open')
  const criticalCount = open.filter((defect) => defect.severity === 'critical').length
  const majorCount = open.filter((defect) => defect.severity === 'major').length
  const minorCount = open.filter((defect) => defect.severity === 'minor').length
  const noiseCount = defects.length - open.length

  let next: ExploreSharedState = {
    ...state,
    defects,
    qualityGate: {
      decision: 'pending',
      blockingReasons: [],
      criticalCount,
      majorCount,
      minorCount,
      recommendation: '',
      confidence: 0.75,
    },
  }

  next = appendExploreAudit(next, {
    phase: 'triage',
    agent: 'triage-agent',
    action: 'triaged_anomalies',
    reason:
      `${open.length} open defect(s) (${criticalCount} critical, ${majorCount} major, ${minorCount} minor)` +
      (noiseCount > 0 ? `; ${noiseCount} marked as likely noise` : ''),
    confidence: 0.75,
    inputs: { open: open.length, noise: noiseCount, criticalCount, majorCount, minorCount },
  })

  return { nextPhase: nextExplorePhase('triage', options.phases), state: next }
}
