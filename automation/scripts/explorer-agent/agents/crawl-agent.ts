import { BugHunterAgent } from '../crawler'
import { appendExploreAudit, nextExplorePhase } from '../state'
import { ExploreAgentResult } from './setup-agent'
import { ExploreOrchestratorOptions, ExploreSharedState } from '../types'

export async function runCrawlAgent(
  state: ExploreSharedState,
  options: ExploreOrchestratorOptions,
): Promise<ExploreAgentResult> {
  const agent = new BugHunterAgent()
  const report = await agent.explore({
    url: options.url,
    headless: options.headless,
    maxPages: options.maxPages,
    maxActionsPerPage: options.maxActionsPerPage,
    sameOriginOnly: options.sameOriginOnly,
    outputDir: options.outputDir,
    runId: state.runId,
    skipMarkdownReport: true,
    ...(options.storageState ? { storageState: options.storageState } : {}),
  })

  let next: ExploreSharedState = {
    ...state,
    pagesVisited: report.pagesVisited,
    actionsPerformed: report.actionsPerformed,
    anomalies: report.anomalies,
    jsonPath: report.jsonPath,
    screenshotsDir: report.screenshotsDir,
  }

  next = appendExploreAudit(next, {
    phase: 'crawl',
    agent: 'crawl-agent',
    action: 'completed_crawl',
    reason:
      `Visited ${report.pagesVisited.length} page(s), ran ${report.actionsPerformed} action(s), ` +
      `found ${report.anomalies.length} anomal(ies)`,
    confidence: 0.9,
    inputs: {
      pagesVisited: report.pagesVisited.length,
      actionsPerformed: report.actionsPerformed,
      anomalyCount: report.anomalies.length,
    },
  })

  return { nextPhase: nextExplorePhase('crawl', options.phases), state: next }
}
