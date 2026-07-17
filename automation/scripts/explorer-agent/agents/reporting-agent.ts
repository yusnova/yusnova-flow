import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildMarkdownReport } from '../report-writer'
import { appendExploreAudit, nextExplorePhase } from '../state'
import { ExploreAgentResult } from './setup-agent'
import { ExploreOrchestratorOptions, ExploreSharedState } from '../types'

export async function runReportingAgent(
  state: ExploreSharedState,
  options: ExploreOrchestratorOptions,
): Promise<ExploreAgentResult> {
  const runDir = path.join(options.outputDir, state.runId)
  fs.mkdirSync(runDir, { recursive: true })

  const pendingGate = state.humanGates.some((gate) => gate.status === 'pending')
  const { criticalCount, majorCount, minorCount } = state.qualityGate
  const openCount = state.defects.filter((defect) => defect.triageStatus === 'open').length

  const decision =
    criticalCount > 0 || pendingGate ? 'fail' : openCount > 0 ? 'pass' : 'pass'
  const blockingReasons = [
    ...(criticalCount > 0 ? [`${criticalCount} open critical anomal(ies)`] : []),
    ...(pendingGate ? ['Human review gate still pending for critical findings'] : []),
  ]
  const recommendation =
    criticalCount > 0
      ? 'Block release until critical exploration findings are triaged.'
      : majorCount > 0
        ? 'Investigate major findings; not necessarily release-blocking.'
        : 'No open critical/major exploration findings.'

  const qualityGate = {
    ...state.qualityGate,
    decision: decision as 'pass' | 'fail' | 'pending',
    blockingReasons,
    recommendation,
    confidence: 0.8,
  }

  const reportPath = path.join(runDir, 'exploration-report.md')
  const markdown = buildMarkdownReport({
    runId: state.runId,
    startUrl: state.url,
    pagesVisited: state.pagesVisited,
    actionsPerformed: state.actionsPerformed,
    anomalies: state.anomalies,
    domain: state.domain,
    qualityGate,
    defects: state.defects,
    auditTrail: state.auditTrail,
  })
  fs.writeFileSync(reportPath, markdown, 'utf-8')

  let next: ExploreSharedState = {
    ...state,
    qualityGate,
    reportPath,
  }

  next = appendExploreAudit(next, {
    phase: 'reporting',
    agent: 'reporting-agent',
    action: 'wrote_exploration_report',
    reason:
      `qualityGate=${qualityGate.decision} · ${criticalCount}c/${majorCount}m/${minorCount}n · report ${reportPath}`,
    confidence: 0.9,
    inputs: { reportPath, decision: qualityGate.decision },
  })

  return { nextPhase: nextExplorePhase('reporting', options.phases), state: next }
}
