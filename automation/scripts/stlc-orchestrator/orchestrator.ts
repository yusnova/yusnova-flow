import * as fs from 'node:fs'
import { runCodegenBridgeAgent } from './agents/codegen-bridge-agent'
import { runExecutionAgent, runTriageAgent } from './agents/execution-agent'
import { runDesignAgent } from './agents/design-agent'
import { runPlanningAgent } from './agents/planning-agent'
import { runReportingAgent } from './agents/reporting-agent'
import { runRequirementsAgent } from './agents/requirements-agent'
import {
  formatReviewIssuesForReport,
  formatReviewIssuesForTerminal,
  ReviewIssueSummary,
  runReviewCodeAgent,
  runReviewDesignAgent,
} from './agents/review-agent'
import { countPhases, PHASE_LABELS } from './phase-labels'
import {
  DEFAULT_PHASE_ORDER,
  saveState,
} from './state/pipeline-state'
import { log, logWarnBlock } from './terminal'
import { AuditEntry, OrchestratorOptions, StlcPhase, StlcSharedState } from './types'

type PhaseRunner = (
  state: StlcSharedState,
  options: OrchestratorOptions,
) => Promise<{ nextPhase: StlcPhase; state: StlcSharedState }>

const PHASE_RUNNERS: Record<Exclude<StlcPhase, 'done'>, PhaseRunner> = {
  requirements: runRequirementsAgent,
  planning: runPlanningAgent,
  design: runDesignAgent,
  review_design: runReviewDesignAgent,
  codegen: runCodegenBridgeAgent,
  review_code: runReviewCodeAgent,
  execution: runExecutionAgent,
  triage: runTriageAgent,
  reporting: runReportingAgent,
}

export interface OrchestratorRunResult {
  state: StlcSharedState
  statePath: string
  reportPath: string
}

export class StlcOrchestrator {
  async run(
    initialState: StlcSharedState,
    options: OrchestratorOptions,
  ): Promise<OrchestratorRunResult> {
    const order = options.phases ?? DEFAULT_PHASE_ORDER
    const totalSteps = countPhases(order)
    const runnablePhases = order.filter((entry) => entry !== 'done')
    let state = initialState
    let phase: StlcPhase = state.currentPhase
    let iterations = 0
    const maxIterations = runnablePhases.length + 5

    while (phase !== 'done') {
      iterations += 1
      if (iterations > maxIterations) {
        log('error', 'Pipeline stopped: phase loop detected (max iterations exceeded)')
        phase = order.includes('reporting') ? 'reporting' : 'done'
        continue
      }

      if (!order.includes(phase)) {
        const index = DEFAULT_PHASE_ORDER.indexOf(phase)
        phase = DEFAULT_PHASE_ORDER[index + 1] ?? 'done'
        continue
      }

      const stepIndex = Math.max(1, runnablePhases.indexOf(phase) + 1)
      const label = PHASE_LABELS[phase as Exclude<StlcPhase, 'done'>]
      log('step', `${stepIndex}/${totalSteps}  ${label}`)

      const runner = PHASE_RUNNERS[phase as Exclude<StlcPhase, 'done'>]
      const result = await runner(state, options)
      state = { ...result.state, currentPhase: result.nextPhase }
      saveState(state, options.outputDir)

      const lastAudit = state.auditTrail[state.auditTrail.length - 1]
      if (lastAudit) {
        this.logPhaseResult(phase, lastAudit)
        if (lastAudit.action === 'blocked_codegen' || lastAudit.action === 'awaiting_human_approval') {
          if (!order.includes('reporting')) {
            break
          }
        }
      }

      if (result.nextPhase === phase) break
      phase = result.nextPhase
    }

    const reportPath = this.writeReport(state, options.outputDir)
    return { state, statePath: saveState(state, options.outputDir), reportPath }
  }

  private logPhaseResult(phase: StlcPhase, entry: AuditEntry): void {
    if (entry.action.includes('blocked')) {
      log('warn', `     ${entry.reason}`)
      if (entry.action === 'blocked_codegen') {
        log('info', '     Tip: wizard → "Auto-approve design review" = yes, or CLI: --skip-human-gates')
      }
      return
    }

    const issueSummary = entry.inputs?.issueSummary as ReviewIssueSummary | undefined
    if (issueSummary) {
      const { headline, bullets } = formatReviewIssuesForTerminal(issueSummary)
      if (bullets.length === 0) {
        log('success', `     ✓  ${headline}`)
      } else {
        logWarnBlock(headline, bullets)
      }
      return
    }

    if (entry.confidence < 0.7) {
      log('warn', `     ${entry.reason}`)
      return
    }

    log('success', `     ✓  ${entry.reason}`)
    if (phase === 'codegen' && stateArtifacts(entry)) {
      const merge = entry.inputs as {
        addedDesignedCases?: number
        coveredDesignedCases?: number
      } | undefined
      if (merge?.addedDesignedCases || merge?.coveredDesignedCases) {
        log(
          'info',
          `     ${merge.coveredDesignedCases ?? 0} design case(s) already covered by scaffold, ${merge.addedDesignedCases ?? 0} added`,
        )
      }
      log('info', `     POM/spec artifacts written`)
    }
  }

  private designReviewReportLines(state: StlcSharedState): string[] {
    const entry = [...state.auditTrail]
      .reverse()
      .find((audit) => audit.phase === 'review_design' && audit.inputs?.issueSummary)

    if (!entry?.inputs?.issueSummary) return ['- None']

    return formatReviewIssuesForReport(entry.inputs.issueSummary as ReviewIssueSummary)
  }

  private writeReport(state: StlcSharedState, outputDir: string): string {
    const runDir = `${outputDir}/${state.runId}`
    fs.mkdirSync(runDir, { recursive: true })
    const reportPath = `${runDir}/quality-report.md`

    const lines = [
      '# STLC Quality Report',
      '',
      `Run ID: ${state.runId}`,
      `Decision: ${state.qualityGate.decision}`,
      `Coverage: ${state.qualityGate.coveragePercent}%`,
      `Recommendation: ${state.qualityGate.recommendation}`,
      '',
      '## Blocking reasons',
      ...(state.qualityGate.blockingReasons.length > 0
        ? state.qualityGate.blockingReasons.map((reason) => `- ${reason}`)
        : ['- None']),
      '',
      '## Test cases',
      ...state.testCases.map(
        (tc) => `- ${tc.id} [${tc.priority}/${tc.level}] ${tc.title} (${tc.status}, confidence ${tc.confidence})`,
      ),
      '',
      '## Design review findings',
      ...this.designReviewReportLines(state),
      '',
      '## Human gates',
      ...(state.humanGates.length > 0
        ? state.humanGates.map((gate) => `- ${gate.phase}: ${gate.status} — ${gate.reason}`)
        : ['- None']),
      '',
      '## Flaky tests',
      ...(state.flakyTests && state.flakyTests.filter((t) => t.recommendation !== 'stable').length > 0
        ? state.flakyTests
          .filter((entry) => entry.recommendation !== 'stable')
          .map(
            (entry) => `- ${entry.caseId}: score ${entry.flakyScore} over ${entry.sampleSize} run(s) — ${entry.recommendation} (recent: ${entry.lastStatuses.join(', ')})`,
          )
        : ['- None']),
      '',
      '## Healing proposals',
      ...(state.healingProposals && state.healingProposals.length > 0
        ? [
          ...state.healingProposals.map(
            (proposal) => `- ${proposal.id}: ${proposal.status} — ${proposal.oldSelector} → ${proposal.proposedSelector}`,
          ),
          ...(state.healingProposals.some((p) => p.status === 'pending_human')
            ? ['', `> Review before applying: \`npm run healing:review -- --run ${state.runId}\``]
            : []),
        ]
        : ['- None']),
      '',
      '## Audit trail (last 10)',
      ...state.auditTrail.slice(-10).map(
        (entry) => `- [${entry.phase}] ${entry.agent}: ${entry.action} — ${entry.reason} (confidence ${entry.confidence})`,
      ),
    ]

    fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8')
    return reportPath
  }
}

function stateArtifacts(entry: AuditEntry): boolean {
  return entry.phase === 'codegen' && entry.action.includes('generated')
}
