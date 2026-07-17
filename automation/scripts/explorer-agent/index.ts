#!/usr/bin/env ts-node
/**
 * Explore bugs mini-orchestrator — same phase/audit/state pattern as stlc:orchestrator.
 *
 * Phases: setup → crawl → triage → review → reporting → rag → done
 *
 * Usage:
 *   npm run explore:bugs -- --url http://localhost:3000 --domain booking --headless
 *   npm run explore:bugs -- --url http://localhost:3000 --domain booking --ingest-rag --skip-human-gates
 *   npm run explore:bugs
 */
import * as path from 'node:path'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { Command } from 'commander'
import * as dotenv from 'dotenv'
import { ExploreOrchestrator } from './orchestrator'
import {
  createInitialExploreState,
  DEFAULT_EXPLORE_PHASE_ORDER,
  saveExploreState,
} from './state'
import { pruneAutomationTmp } from '../shared/tmp-cleanup'
import { fatalError, log, style } from '../stlc-orchestrator/terminal'
import { ExploreOrchestratorOptions, ExplorePhase, ExploreSharedState } from './types'

const AUTOMATION_ROOT = path.resolve(__dirname, '..', '..')
const DEFAULT_OUTPUT = path.join(AUTOMATION_ROOT, 'tmp/stlc/exploration')
const STLC_OUTPUT = path.join(AUTOMATION_ROOT, 'tmp/stlc')

dotenv.config({ path: path.join(AUTOMATION_ROOT, '.env') })

const HELP_AFTER = `
What it does:
  Runs an exploratory QA mini-orchestrator (mirrors stlc:orchestrator):
    setup → crawl → triage → review → reporting → rag

  Each phase writes to audit_trail with reason + confidence.
  state.json + exploration-report.md land under tmp/stlc/exploration/{runId}/.

  This does NOT replace stlc:orchestrator (no AC → POM → specs). It finds
  runtime anomalies on a live URL. STLC --explore is a different thing
  (codegen PageExplorer for selectors).

Non-interactive:
  npm run explore:bugs -- --url http://localhost:3000 --domain booking --headless

Interactive (default when --url omitted):
  npm run explore:bugs
`

function buildProgram(): Command {
  return new Command()
    .name('explore:bugs')
    .description(
      'Explore mini-orchestrator — crawl a live app and flag anomalies (setup → crawl → triage → review → reporting → rag)',
    )
    .option('--url <url>', 'starting URL to explore')
    .option('--domain <name>', 'domain / module tag (for RAG + report)', 'explored')
    .option('--max-pages <n>', 'max distinct pages to visit', '5')
    .option('--max-actions-per-page <n>', 'max buttons/controls to click per page', '15')
    .option('--headless', 'hide browser', false)
    .option('--storage-state <path>', 'auth storage state JSON path')
    .option('--allow-cross-origin', 'also follow links to other origins', false)
    .option('--output-dir <path>', 'exploration output directory', DEFAULT_OUTPUT)
    .option('--ingest-rag', 'feed open critical/major defects into the defect-pattern RAG knowledge base', false)
    .option('--module <name>', 'alias for --domain (RAG module tag)')
    .option('--skip-human-gates', 'auto-acknowledge critical findings (no pending human gate)', false)
    .option('--phases <list>', 'comma-separated phases (e.g. setup,crawl,triage,reporting)')
    .option('--no-tmp-prune', 'disable automatic cleanup of old tmp/stlc exploration runs')
    .option('--tmp-keep-runs <n>', 'max exploration runs to retain (default: 15 or STLC_TMP_KEEP_RUNS)', '15')
    .option('--tmp-max-age-days <n>', 'delete exploration runs older than N days (default: 14 or STLC_TMP_MAX_AGE_DAYS)', '14')
    .addHelpText('after', HELP_AFTER)
    .showHelpAfterError('(for full help: npm run explore:bugs -- --help)')
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

function parsePhases(raw?: string): ExplorePhase[] | undefined {
  if (!raw?.trim()) return undefined
  const allowed = new Set<string>(DEFAULT_EXPLORE_PHASE_ORDER)
  const phases = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean) as ExplorePhase[]
  for (const phase of phases) {
    if (!allowed.has(phase)) {
      throw new Error(`Unknown explore phase "${phase}". Allowed: ${DEFAULT_EXPLORE_PHASE_ORDER.join(', ')}`)
    }
  }
  return phases.includes('done') ? phases : [...phases, 'done']
}

async function promptIfNeeded(opts: {
  url?: string
  domain: string
  headless: boolean
  ingestRag: boolean
  skipHumanGates: boolean
  maxPages: string
}): Promise<{
  url: string
  domain: string
  headless: boolean
  ingestRag: boolean
  skipHumanGates: boolean
  maxPages: string
}> {
  if (opts.url) {
    return {
      url: opts.url,
      domain: opts.domain,
      headless: opts.headless,
      ingestRag: opts.ingestRag,
      skipHumanGates: opts.skipHumanGates,
      maxPages: opts.maxPages,
    }
  }

  const TOTAL = 6
  const rl = readline.createInterface({ input, output })

  const askText = async (
    step: number,
    title: string,
    hint: string,
    example: string | undefined,
    fallback: string,
    required: boolean,
  ): Promise<string> => {
    while (true) {
      console.log(`\n${style.cyan(`━━ Step ${step}/${TOTAL} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`)
      console.log(style.bold(title))
      console.log(style.dim(hint))
      if (example) console.log(`${style.dim('Example:')} ${example}`)
      const prompt = fallback
        ? `${style.green('→')} ${style.dim(`[${fallback}]`)} `
        : `${style.green('→')} `
      const answer = (await rl.question(prompt)).trim()
      if (answer) return answer
      if (!required) return fallback
      console.log(style.yellow('  This field is required. Please enter a value.'))
    }
  }

  const askYesNo = async (
    step: number,
    title: string,
    hint: string,
    defaultYes: boolean,
  ): Promise<boolean> => {
    while (true) {
      console.log(`\n${style.cyan(`━━ Step ${step}/${TOTAL} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`)
      console.log(style.bold(title))
      console.log(style.dim(hint))
      const defaultLabel = defaultYes ? 'Y/n' : 'y/N'
      const answer = (await rl.question(`${style.green('→')} ${style.dim(`(${defaultLabel})`)} `))
        .trim()
        .toLowerCase()
      if (!answer) return defaultYes
      if (answer === 'y' || answer === 'yes') return true
      if (answer === 'n' || answer === 'no') return false
      console.log(style.yellow('  Please answer y or n.'))
    }
  }

  try {
    log('step', 'Interactive explore wizard')
    log('info', '     Crawls a live URL looking for JS/network/UI anomalies (not STLC codegen).')

    const url = await askText(
      1,
      'Starting URL',
      'The live page the browser opens first. Same-origin links are followed from here.',
      'http://localhost:3000',
      '',
      true,
    )

    const domain = await askText(
      2,
      'Domain / module name',
      'Short label for this app area — used in the report and when saving findings to the RAG knowledge base (so later STLC runs can warn about similar bugs).',
      'booking, checkout, inventory',
      opts.domain,
      false,
    )

    const maxPages = await askText(
      3,
      'Max pages to visit',
      'How many distinct pages the crawler may open (breadth-first). Higher = slower but wider coverage.',
      '5',
      opts.maxPages,
      false,
    )

    const headless = await askYesNo(
      4,
      'Run browser headless?',
      'Yes = no visible window (good for CI/scripts). No = you watch the crawl in a real browser window.',
      false,
    )

    const ingestRag = await askYesNo(
      5,
      'Ingest findings into RAG?',
      'Yes = save open critical/major defects into the shared defect-pattern knowledge base (used by stlc:orchestrator). No = report only, nothing stored for later runs.',
      false,
    )

    const skipHumanGates = await askYesNo(
      6,
      'Skip human review gates?',
      'Yes = auto-acknowledge critical findings and finish the run. No = if critical bugs are found, mark a pending human-review gate in state.json (stricter / safer default for local demos).',
      false,
    )

    return { url, domain, maxPages, headless, ingestRag, skipHumanGates }
  } finally {
    rl.close()
  }
}

function printSummary(state: ExploreSharedState, statePath: string): void {
  const { criticalCount, majorCount, minorCount, decision } = state.qualityGate
  console.log(`
\x1b[1m═══════════════════════════════════════\x1b[0m
  Run          : ${state.runId}
  Domain       : ${state.domain}
  Quality gate : ${decision === 'fail' ? style.red(decision) : style.green(decision)}
  Pages visited: ${state.pagesVisited.length}
  Actions run  : ${state.actionsPerformed}
  Anomalies    : ${state.anomalies.length}  (${style.red(String(criticalCount))} critical, ${style.yellow(String(majorCount))} major, ${minorCount} minor)
  Open defects : ${state.defects.filter((d) => d.triageStatus === 'open').length}
  Report       : ${state.reportPath ?? '(none)'}
  State        : ${statePath}
  Screenshots  : ${state.screenshotsDir ?? '(none)'}
`)
}

async function main(): Promise<void> {
  const program = buildProgram()
  program.parse(process.argv)
  const opts = program.opts<{
    url?: string
    domain: string
    maxPages: string
    maxActionsPerPage: string
    headless: boolean
    storageState?: string
    allowCrossOrigin: boolean
    outputDir: string
    ingestRag: boolean
    module?: string
    skipHumanGates: boolean
    phases?: string
    tmpPrune?: boolean
    tmpKeepRuns: string
    tmpMaxAgeDays: string
  }>()

  autoPruneTmp({
    enabled: opts.tmpPrune !== false,
    maxRuns: Number(process.env.STLC_TMP_KEEP_RUNS ?? opts.tmpKeepRuns ?? 15),
    maxAgeDays: Number(process.env.STLC_TMP_MAX_AGE_DAYS ?? opts.tmpMaxAgeDays ?? 14),
  })

  const resolved = await promptIfNeeded({
    url: opts.url,
    domain: opts.module ?? opts.domain,
    headless: opts.headless,
    ingestRag: opts.ingestRag,
    skipHumanGates: opts.skipHumanGates,
    maxPages: opts.maxPages,
  })

  const options: ExploreOrchestratorOptions = {
    url: resolved.url,
    domain: resolved.domain,
    headless: resolved.headless,
    maxPages: Number(resolved.maxPages),
    maxActionsPerPage: Number(opts.maxActionsPerPage),
    sameOriginOnly: !opts.allowCrossOrigin,
    outputDir: path.resolve(opts.outputDir),
    ingestRag: resolved.ingestRag,
    skipHumanGates: resolved.skipHumanGates,
    ...(opts.storageState ? { storageState: opts.storageState } : {}),
    ...(parsePhases(opts.phases) ? { phases: parsePhases(opts.phases) } : {}),
  }

  const initial = createInitialExploreState(options)
  saveExploreState(initial, options.outputDir)

  log('step', `Explore orchestrator · ${options.url} · domain=${options.domain}`)
  log('info', `     Run ${initial.runId} · phases ${ (options.phases ?? DEFAULT_EXPLORE_PHASE_ORDER).filter((p) => p !== 'done').join(' → ') }`)

  const result = await new ExploreOrchestrator().run(initial, options)
  printSummary(result.state, result.statePath)

  if (result.state.qualityGate.decision === 'fail' || result.state.qualityGate.criticalCount > 0) {
    log('warn', `Exploration quality gate failed — review ${result.reportPath || result.statePath}`)
    process.exitCode = 1
  }
}

main().catch(fatalError)
