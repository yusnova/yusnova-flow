import { runCrawlAgent } from './agents/crawl-agent'
import { runRagAgent } from './agents/rag-agent'
import { runReportingAgent } from './agents/reporting-agent'
import { runReviewAgent } from './agents/review-agent'
import { runSetupAgent, ExploreAgentResult } from './agents/setup-agent'
import { runTriageAgent } from './agents/triage-agent'
import { EXPLORE_PHASE_LABELS } from './phase-labels'
import {
  countExplorePhases,
  DEFAULT_EXPLORE_PHASE_ORDER,
  saveExploreState,
} from './state'
import { log } from '../stlc-orchestrator/terminal'
import {
  ExploreAuditEntry,
  ExploreOrchestratorOptions,
  ExplorePhase,
  ExploreSharedState,
} from './types'

type PhaseRunner = (
  state: ExploreSharedState,
  options: ExploreOrchestratorOptions,
) => Promise<ExploreAgentResult>

const PHASE_RUNNERS: Record<Exclude<ExplorePhase, 'done'>, PhaseRunner> = {
  setup: runSetupAgent,
  crawl: runCrawlAgent,
  triage: runTriageAgent,
  review: runReviewAgent,
  reporting: runReportingAgent,
  rag: runRagAgent,
}

export interface ExploreOrchestratorRunResult {
  state: ExploreSharedState
  statePath: string
  reportPath: string
}

export class ExploreOrchestrator {
  async run(
    initialState: ExploreSharedState,
    options: ExploreOrchestratorOptions,
  ): Promise<ExploreOrchestratorRunResult> {
    const order = options.phases ?? DEFAULT_EXPLORE_PHASE_ORDER
    const totalSteps = countExplorePhases(order)
    const runnablePhases = order.filter((entry) => entry !== 'done')
    let state = initialState
    let phase: ExplorePhase = state.currentPhase
    let iterations = 0
    const maxIterations = runnablePhases.length + 5

    while (phase !== 'done') {
      iterations += 1
      if (iterations > maxIterations) {
        log('error', 'Explore pipeline stopped: phase loop detected (max iterations exceeded)')
        phase = order.includes('reporting') ? 'reporting' : 'done'
        continue
      }

      if (!order.includes(phase)) {
        const index = DEFAULT_EXPLORE_PHASE_ORDER.indexOf(phase)
        phase = DEFAULT_EXPLORE_PHASE_ORDER[index + 1] ?? 'done'
        continue
      }

      const stepIndex = Math.max(1, runnablePhases.indexOf(phase) + 1)
      const label = EXPLORE_PHASE_LABELS[phase as Exclude<ExplorePhase, 'done'>]
      log('step', `${stepIndex}/${totalSteps}  ${label}`)

      const runner = PHASE_RUNNERS[phase as Exclude<ExplorePhase, 'done'>]
      const result = await runner(state, options)
      state = { ...result.state, currentPhase: result.nextPhase }
      saveExploreState(state, options.outputDir)

      const lastAudit = state.auditTrail[state.auditTrail.length - 1]
      if (lastAudit) this.logPhaseResult(phase, lastAudit)

      if (result.nextPhase === phase) break
      phase = result.nextPhase
    }

    const statePath = saveExploreState(state, options.outputDir)
    return {
      state,
      statePath,
      reportPath: state.reportPath ?? '',
    }
  }

  private logPhaseResult(phase: ExplorePhase, entry: ExploreAuditEntry): void {
    if (entry.action.includes('blocked') || entry.action === 'awaiting_human_approval') {
      log('warn', `     ${entry.reason}`)
      return
    }
    if (entry.confidence < 0.7) {
      log('warn', `     ${entry.reason}`)
      return
    }
    log('success', `     ✓  ${entry.reason}`)
  }
}
