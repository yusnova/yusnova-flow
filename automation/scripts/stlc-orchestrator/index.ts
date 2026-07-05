#!/usr/bin/env ts-node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Command } from 'commander'
import * as dotenv from 'dotenv'
import { normalizeDomainName } from '../codegen-agent/domain-name'
import { normalizePageName } from '../codegen-agent/page-name'
import { GeneratorOptions } from '../codegen-agent/types'
import { runInteractiveWizard } from './interactive-wizard'
import { StlcOrchestrator } from './orchestrator'
import { PR_PHASES } from './profiles'
import { createInitialState } from './state/pipeline-state'
import { pruneAutomationTmp } from '../shared/tmp-cleanup'
import { fatalError, log, relativePath } from './terminal'
import { OrchestratorOptions, StlcPhase } from './types'

export { PR_PHASES } from './profiles'

const AUTOMATION_ROOT = path.resolve(__dirname, '..', '..')
const DEFAULT_OUTPUT = path.join(AUTOMATION_ROOT, 'tmp/stlc')

dotenv.config({ path: path.join(AUTOMATION_ROOT, '.env') })

const HELP_AFTER = `
What it does:
  Runs the agentic STLC pipeline with specialised agents:
    requirements → planning → design → review → codegen → review → execution → reporting

  Each agent writes decisions to audit_trail with reason and confidence.
  Wraps the existing codegen pipeline — does not replace codegen:agent.

Interactive mode (default):
  npm run stlc:orchestrator

  Prompts for URL, domain, page, requirements, and codegen options.

Non-interactive mode (CI / scripts):
  npm run stlc:orchestrator -- \\
    --url https://<host>/inventory.html \\
    --domain inventory \\
    --page InventoryPage \\
    --requirement-file ./requirements/inventory.md \\
    --explore \\
    --overwrite

Flags:
  --url <url>              Target page URL
  --domain <name>          Feature folder name
  --page <Name>            POM class name
  --requirement <text>     Inline acceptance criteria
  --requirement-file <path> Requirement markdown/text file
  --profile <pr|full>      pr = skip test execution; full = include execution phase (prefer --run-tests)
  --run-tests              Execute Playwright after codegen
  --explore                Record click-through before codegen
  --overwrite              Replace existing generated files
  --skip-human-gates       Auto-approve review gates (wizard enables this by default)
  --headless               Hide browser during codegen
  --no-llm                 Disable LLM agents (use heuristics)
  --no-rag                 Disable defect pattern RAG
  --no-self-healing        Disable selector healing proposals
`

function buildProgram(): Command {
  return new Command()
    .name('stlc:orchestrator')
    .description('Run agentic STLC pipeline (requirements → reporting)')
    .option('--url <url>', 'target page URL')
    .option('--domain <domain>', 'feature folder name')
    .option('--page <page>', 'POM class name in PascalCase')
    .option('--type <type>', 'spec type: ui | api | e2e', 'ui')
    .option('--requirement <text>', 'inline requirement / acceptance criteria')
    .option('--requirement-file <path>', 'path to requirement markdown/text file')
    .option('--explore', 'explore page before codegen', false)
    .option('--overwrite', 'overwrite generated artifacts', false)
    .option('--headless', 'headless browser', false)
    .option('--run-tests', 'execute Playwright after codegen', false)
    .option('--skip-human-gates', 'auto-approve human review gates', false)
    .option('--phases <list>', 'comma-separated phases (e.g. requirements,design,codegen)')
    .option('--profile <name>', 'pipeline profile: pr | full', 'full')
    .option('--no-llm', 'disable LLM for requirements/design agents', false)
    .option('--no-rag', 'disable defect pattern RAG', false)
    .option('--no-self-healing', 'disable selector healing proposals', false)
    .option('--output-dir <path>', 'STLC state output directory', DEFAULT_OUTPUT)
    .option('--storage-state <path>', 'auth storage state JSON path')
    .option('--codegen-file <path>', 'pre-recorded codegen file')
    .option('--no-codegen', 'skip built-in playwright codegen step', false)
    .option('--no-tmp-prune', 'disable automatic cleanup of old tmp/stlc runs')
    .option('--tmp-keep-runs <n>', 'max STLC run folders to retain (default: 15 or STLC_TMP_KEEP_RUNS)', '15')
    .option('--tmp-max-age-days <n>', 'delete STLC runs older than N days (default: 14 or STLC_TMP_MAX_AGE_DAYS)', '14')
    .addHelpText('after', HELP_AFTER)
    .showHelpAfterError('(for full help: npm run stlc:orchestrator:help)')
}

function parsePhases(raw?: string): StlcPhase[] | undefined {
  if (!raw) return undefined
  return raw.split(',').map((phase) => phase.trim()) as StlcPhase[]
}

function readRequirement(opts: { requirement?: string; requirementFile?: string }): string {
  if (opts.requirementFile) {
    return fs.readFileSync(path.resolve(opts.requirementFile), 'utf-8')
  }
  if (opts.requirement) return opts.requirement
  return [
    'AC: User can view the product list',
    'AC: User must be able to add items to cart',
    'AC: User can sort products by price',
  ].join('\n')
}

function buildCodegenOptions(raw: {
  url: string
  domain: string
  page: string
  type: string
  headless: boolean
  overwrite: boolean
  explore: boolean
  storageState?: string
  codegenFile?: string
  noCodegen: boolean
}): GeneratorOptions {
  if (!['ui', 'api', 'e2e'].includes(raw.type)) {
    throw new Error(`Invalid --type "${raw.type}". Use ui, api, or e2e.`)
  }

  return {
    url: raw.url,
    domain: normalizeDomainName(raw.domain),
    page: normalizePageName(raw.page),
    type: raw.type as GeneratorOptions['type'],
    headless: raw.headless,
    overwrite: raw.overwrite,
    explore: raw.explore,
    noCodegen: raw.noCodegen,
    ...(raw.storageState ? { storageState: raw.storageState } : {}),
    ...(raw.codegenFile ? { codegenFile: raw.codegenFile } : {}),
  }
}

async function resolveRun(): Promise<{
  requirementText: string
  requirementFile?: string
  options: OrchestratorOptions
  tmpPrune: { enabled: boolean; maxRuns: number; maxAgeDays: number }
}> {
  const program = buildProgram()
  program.parse(process.argv)

  const raw = program.opts<{
    url?: string
    domain?: string
    page?: string
    type: string
    requirement?: string
    requirementFile?: string
    explore: boolean
    overwrite: boolean
    headless: boolean
    runTests: boolean
    skipHumanGates: boolean
    phases?: string
    profile: string
    llm: boolean
    rag: boolean
    selfHealing: boolean
    outputDir: string
    storageState?: string
    codegenFile?: string
    noCodegen: boolean
    tmpPrune?: boolean
    tmpKeepRuns: string
    tmpMaxAgeDays: string
  }>()

  const hasCliFlags = Boolean(raw.url && raw.domain && raw.page)

  const tmpPrune = {
    enabled: raw.tmpPrune !== false,
    maxRuns: Number(process.env.STLC_TMP_KEEP_RUNS ?? raw.tmpKeepRuns ?? 15),
    maxAgeDays: Number(process.env.STLC_TMP_MAX_AGE_DAYS ?? raw.tmpMaxAgeDays ?? 14),
  }

  if (!hasCliFlags) {
    const wizard = await runInteractiveWizard(AUTOMATION_ROOT, path.resolve(DEFAULT_OUTPUT))
    return { ...wizard, tmpPrune }
  }

  const requirementText = readRequirement(raw)
  const codegen = buildCodegenOptions({
    url: raw.url!,
    domain: raw.domain!,
    page: raw.page!,
    type: raw.type,
    headless: raw.headless,
    overwrite: raw.overwrite,
    explore: raw.explore,
    noCodegen: raw.noCodegen,
    ...(raw.storageState ? { storageState: raw.storageState } : {}),
    ...(raw.codegenFile ? { codegenFile: raw.codegenFile } : {}),
  })

  const phases = parsePhases(raw.phases)
    ?? (raw.profile === 'pr' ? PR_PHASES : undefined)

  const options: OrchestratorOptions = {
    requirementText,
    ...(raw.requirementFile ? { requirementFile: raw.requirementFile } : {}),
    codegen,
    ...(phases ? { phases } : {}),
    skipHumanGates: raw.skipHumanGates,
    runTests: raw.runTests || raw.profile === 'full',
    enableLlm: raw.llm !== false,
    enableRag: raw.rag !== false,
    enableSelfHealing: raw.selfHealing !== false,
    outputDir: path.resolve(raw.outputDir),
    humanConfidenceThreshold: 0.75,
  }

  return {
    requirementText,
    ...(raw.requirementFile ? { requirementFile: raw.requirementFile } : {}),
    options,
    tmpPrune,
  }
}

function autoPruneTmp(config: { enabled: boolean; maxRuns: number; maxAgeDays: number }): void {
  if (!config.enabled) return

  const result = pruneAutomationTmp(AUTOMATION_ROOT, {
    stlcDir: DEFAULT_OUTPUT,
    maxRuns: config.maxRuns,
    maxAgeDays: config.maxAgeDays,
  })

  if (result.removed.length > 0 || result.codegenRemoved.length > 0) {
    const parts = []
    if (result.removed.length > 0) parts.push(`${result.removed.length} STLC run(s)`)
    if (result.codegenRemoved.length > 0) parts.push(`${result.codegenRemoved.length} scratch file(s)`)
    log('info', `     Pruned tmp: ${parts.join(', ')} (kept ${result.kept} recent run(s); knowledge/ preserved)`)
  }
}

function printBanner(opts: OrchestratorOptions, requirementFile?: string): void {
  const pipeline = opts.runTests ? 'generate + run tests' : 'generate only'
  console.log(`
\x1b[1m╔═══════════════════════════════════════╗
║   stlc:orchestrator  v0.1.0           ║
╚═══════════════════════════════════════╝\x1b[0m
  URL         : ${opts.codegen.url}
  Domain      : ${opts.codegen.domain}
  Page        : ${opts.codegen.page}
  Pipeline    : ${pipeline}
  Requirement : ${requirementFile ?? '(inline / demo AC)'}
  Explore     : ${opts.codegen.explore}
  Overwrite   : ${opts.codegen.overwrite}
  Browser     : ${opts.codegen.headless ? 'hidden' : 'visible'}
  LLM         : ${opts.enableLlm ? 'yes' : 'no (heuristics)'}
  Output      : ${opts.outputDir}
`)
}

function printSummary(result: {
  statePath: string
  reportPath: string
  decision: string
  coverage: number
  testCases: number
  pendingGates: number
  recommendation: string
  domain: string
  codegenArtifacts?: { pomPath: string; specPath: string }
}): void {
  const gateColor = result.decision === 'go' ? '\x1b[32m' : result.decision === 'no_go' ? '\x1b[31m' : '\x1b[33m'

  console.log(`
\x1b[1m═══════════════════════════════════════\x1b[0m
  Quality gate : ${gateColor}${result.decision}\x1b[0m
  Coverage     : ${result.coverage}%
  Test cases   : ${result.testCases}
  Human gates  : ${result.pendingGates} pending
  State        : ${relativePath(AUTOMATION_ROOT, result.statePath)}
  Report       : ${relativePath(AUTOMATION_ROOT, result.reportPath)}
${result.codegenArtifacts
    ? `  POM          : ${relativePath(AUTOMATION_ROOT, result.codegenArtifacts.pomPath)}
  Spec         : ${relativePath(AUTOMATION_ROOT, result.codegenArtifacts.specPath)}
`
    : ''}
  Recommendation:
  ${result.recommendation}

  Next steps:
    1. Review ${relativePath(AUTOMATION_ROOT, result.reportPath)}
    2. Resolve pending human gates if any
    3. Run: \x1b[1mnpm run validate -- --domain ${result.domain}\x1b[0m
`)
}

async function main(): Promise<void> {
  const { requirementText, options, requirementFile, tmpPrune } = await resolveRun()

  autoPruneTmp(tmpPrune)
  printBanner(options, requirementFile)

  const initialState = createInitialState(requirementText, options)
  const orchestrator = new StlcOrchestrator()
  const result = await orchestrator.run(initialState, options)

  if (result.state.humanGates.some((gate) => gate.status === 'pending')) {
    log('warn', 'Human review gates are pending — see state.json before release.')
  }

  printSummary({
    statePath: result.statePath,
    reportPath: result.reportPath,
    decision: result.state.qualityGate.decision,
    coverage: result.state.qualityGate.coveragePercent,
    testCases: result.state.testCases.length,
    pendingGates: result.state.humanGates.filter((gate) => gate.status === 'pending').length,
    recommendation: result.state.qualityGate.recommendation,
    domain: options.codegen.domain,
    ...(result.state.codegenArtifacts
      ? {
          codegenArtifacts: {
            pomPath: result.state.codegenArtifacts.pomPath,
            specPath: result.state.codegenArtifacts.specPath,
          },
        }
      : {}),
  })
}

main().catch(fatalError)
