#!/usr/bin/env ts-node
/**
 * Autonomous exploration / bug-hunter agent CLI.
 *
 * Crawls a live app breadth-first (following same-origin links, clicking
 * buttons/controls) and flags anomalies — console errors, uncaught JS
 * exceptions, failed/4xx/5xx network calls, visible error text, broken
 * images — with a screenshot + action trail for each. No test cases or
 * requirements needed; this is exploratory QA, complementing (not
 * replacing) the scripted STLC pipeline.
 *
 * Usage:
 *   npm run explore:bugs -- --url https://<host>/ --max-pages 8
 *   npm run explore:bugs -- --url https://<host>/ --ingest-rag --module checkout
 */
import * as path from 'node:path'
import { Command } from 'commander'
import * as dotenv from 'dotenv'
import { BugHunterAgent } from './crawler'
import { pruneAutomationTmp } from '../shared/tmp-cleanup'
import { DefectKnowledgeBase } from '../stlc-orchestrator/rag/defect-knowledge'
import { fatalError, log, style } from '../stlc-orchestrator/terminal'
import { DefectRecord } from '../stlc-orchestrator/types'

const AUTOMATION_ROOT = path.resolve(__dirname, '..', '..')
const DEFAULT_OUTPUT = path.join(AUTOMATION_ROOT, 'tmp/stlc/exploration')
const STLC_OUTPUT = path.join(AUTOMATION_ROOT, 'tmp/stlc')

dotenv.config({ path: path.join(AUTOMATION_ROOT, '.env') })

function buildProgram(): Command {
  return new Command()
    .name('explore:bugs')
    .description(
      'Autonomous exploration agent — crawls a page/app clicking through controls and flags anomalies ' +
        '(JS errors, network failures, visible error text, broken images). No test cases required.',
    )
    .requiredOption('--url <url>', 'starting URL to explore')
    .option('--max-pages <n>', 'max distinct pages to visit', '5')
    .option('--max-actions-per-page <n>', 'max buttons/controls to click per page', '15')
    .option('--headless', 'hide browser', false)
    .option('--storage-state <path>', 'auth storage state JSON path')
    .option('--allow-cross-origin', 'also follow links to other origins', false)
    .option('--output-dir <path>', 'output directory', DEFAULT_OUTPUT)
    .option('--ingest-rag', 'feed critical/major anomalies into the defect-pattern RAG knowledge base', false)
    .option('--module <name>', 'module/domain tag for ingested defects (default: URL hostname)')
    .option('--no-tmp-prune', 'disable automatic cleanup of old tmp/stlc exploration runs')
    .option('--tmp-keep-runs <n>', 'max exploration runs to retain (default: 15 or STLC_TMP_KEEP_RUNS)', '15')
    .option('--tmp-max-age-days <n>', 'delete exploration runs older than N days (default: 14 or STLC_TMP_MAX_AGE_DAYS)', '14')
}

function autoPruneTmp(config: { enabled: boolean; maxRuns: number; maxAgeDays: number }): void {
  if (!config.enabled) return

  const result = pruneAutomationTmp(AUTOMATION_ROOT, {
    stlcDir: STLC_OUTPUT,
    maxRuns: config.maxRuns,
    maxAgeDays: config.maxAgeDays,
  })

  if (result.removed.length > 0 || result.codegenRemoved.length > 0 || result.explorationRemoved.length > 0) {
    const parts = []
    if (result.explorationRemoved.length > 0) parts.push(`${result.explorationRemoved.length} exploration run(s)`)
    if (result.removed.length > 0) parts.push(`${result.removed.length} STLC run(s)`)
    if (result.codegenRemoved.length > 0) parts.push(`${result.codegenRemoved.length} scratch file(s)`)
    log('info', `     Pruned tmp: ${parts.join(', ')} (kept ${result.explorationKept} exploration + ${result.kept} STLC run(s))`)
  }
}

function printSummary(result: {
  runId: string
  pagesVisited: string[]
  actionsPerformed: number
  anomalies: Array<{ severity: 'critical' | 'major' | 'minor' }>
  reportPath: string
  jsonPath: string
  screenshotsDir: string
}): void {
  const critical = result.anomalies.filter((a) => a.severity === 'critical').length
  const major = result.anomalies.filter((a) => a.severity === 'major').length
  const minor = result.anomalies.filter((a) => a.severity === 'minor').length

  console.log(`
\x1b[1m═══════════════════════════════════════\x1b[0m
  Run          : ${result.runId}
  Pages visited: ${result.pagesVisited.length}
  Actions run  : ${result.actionsPerformed}
  Anomalies    : ${result.anomalies.length}  (${style.red(String(critical))} critical, ${style.yellow(String(major))} major, ${minor} minor)
  Report       : ${result.reportPath}
  Raw data     : ${result.jsonPath}
  Screenshots  : ${result.screenshotsDir}
`)
}

async function main(): Promise<void> {
  const program = buildProgram()
  program.parse(process.argv)
  const opts = program.opts<{
    url: string
    maxPages: string
    maxActionsPerPage: string
    headless: boolean
    storageState?: string
    allowCrossOrigin: boolean
    outputDir: string
    ingestRag: boolean
    module?: string
    tmpPrune?: boolean
    tmpKeepRuns: string
    tmpMaxAgeDays: string
  }>()

  autoPruneTmp({
    enabled: opts.tmpPrune !== false,
    maxRuns: Number(process.env.STLC_TMP_KEEP_RUNS ?? opts.tmpKeepRuns ?? 15),
    maxAgeDays: Number(process.env.STLC_TMP_MAX_AGE_DAYS ?? opts.tmpMaxAgeDays ?? 14),
  })

  log('step', `Bug-hunter agent exploring ${opts.url}`)
  log('info', `     Budget: ${opts.maxPages} page(s) × ${opts.maxActionsPerPage} action(s)/page, headless=${opts.headless}`)

  const agent = new BugHunterAgent()
  const result = await agent.explore({
    url: opts.url,
    headless: opts.headless,
    maxPages: Number(opts.maxPages),
    maxActionsPerPage: Number(opts.maxActionsPerPage),
    sameOriginOnly: !opts.allowCrossOrigin,
    outputDir: path.resolve(opts.outputDir),
    ...(opts.storageState ? { storageState: opts.storageState } : {}),
  })

  printSummary(result)

  if (opts.ingestRag && result.anomalies.length > 0) {
    const moduleTag = opts.module ?? new URL(opts.url).hostname
    const defects: DefectRecord[] = result.anomalies
      .filter((anomaly) => anomaly.severity !== 'minor')
      .map((anomaly, index) => ({
        id: `EXPLORE-${result.runId}-${index + 1}`,
        title: `${anomaly.description} (${anomaly.pageUrl})`,
        severity: anomaly.severity,
        dedupHash: anomaly.id,
        triageStatus: 'open',
        rootCauseHypothesis: anomaly.evidence.slice(0, 200),
        linkedCaseIds: [],
        confidence: 0.6,
      }))

    if (defects.length > 0) {
      const knowledgeBase = new DefectKnowledgeBase()
      const added = knowledgeBase.ingestFromDefects(defects, moduleTag, result.runId)
      log('success', `Ingested ${added.length} defect pattern(s) into RAG knowledge base (module: ${moduleTag})`)
    }
  }

  const criticalCount = result.anomalies.filter((a) => a.severity === 'critical').length
  if (criticalCount > 0) {
    log('warn', `${criticalCount} critical anomaly/anomalies found — review ${result.reportPath} before release.`)
    process.exitCode = 1
  }
}

main().catch(fatalError)
