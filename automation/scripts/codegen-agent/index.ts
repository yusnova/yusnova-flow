#!/usr/bin/env ts-node
import * as path from 'node:path'
import { Command } from 'commander'
import { runInteractiveWizard } from './interactive-wizard'
import { normalizeDomainName } from '@codegen-agent/naming/domain-name'
import { normalizePageName } from '@codegen-agent/naming/page-name'
import { GeneratorOptions } from './types'
import { AUTOMATION_ROOT, runCodegenPipeline } from './pipeline'

const HELP_AFTER = `
What it does:
  Analyses a live page, clicks through elements to record flows and scan modals,
  and generates:
    • pages/{page}-page.ts          → Page Object (POM)
    • suites/{domain}/{domain}.ui.spec.ts → Playwright spec

Interactive mode (default):
  npm run codegen:agent

  Prompts for URL, domain, page name, and overwrite options.
  Page exploration (click-through + modal scan) runs automatically.
  Type is fixed to ui for browser tests.

Non-interactive mode (CI / scripts):
  npm run codegen:agent -- \\
    --url https://<host>/example-path \\
    --domain domainName \\
    --page PomPageName \\
    --type ui \\
    --overwrite

Flags:
  --url <url>         Target page URL
  --domain <name>     Feature folder name (suites/domainName/)
  --page <Name>       POM class name in PascalCase
  --type <ui|api|e2e> Spec type (default: ui)
  --no-explore        Skip click-through exploration (enabled by default)
  --overwrite         Replace existing POM/spec files if they already exist
  --headless          Run browser without a visible window
  --storage-state     Optional auth JSON; auto-login via .env when omitted
  --codegen-file      Pre-recorded Playwright codegen output
  --no-codegen        Skip the built-in Playwright codegen step
`

function buildProgram(): Command {
  const program = new Command()

  program
    .name('codegen:agent')
    .description('Generate POM + spec from a live page')
    .option('--url <url>', 'target page URL')
    .option('--domain <domain>', 'feature folder name')
    .option('--page <page>', 'POM class name in PascalCase')
    .option('--type <type>', 'spec type: ui | api | e2e', 'ui')
    .option('--no-explore', 'skip click-through page exploration (explore is on by default)', false)
    .option(
      '--storage-state <path>',
      'optional auth JSON; auto-login with REGULAR_USER from .env when session is missing or expired',
    )
    .option('--overwrite', 'overwrite existing POM/spec files', false)
    .option('--headless', 'run browser in headless mode', false)
    .option('--codegen-file <path>', 'pre-recorded Playwright codegen file (e.g. tmp/codegen-raw.ts)')
    .option('--no-codegen', 'skip the built-in Playwright codegen step')
    .addHelpText('after', HELP_AFTER)
    .showHelpAfterError('(for full help: npm run codegen:agent -- --help)')

  return program
}

async function resolveOptions(): Promise<GeneratorOptions> {
  const program = buildProgram()
  program.parse(process.argv)

  const raw = program.opts<{
    url?: string
    domain?: string
    page?: string
    type: string
    headless: boolean
    overwrite: boolean
    storageState?: string
    noExplore: boolean
    codegenFile?: string
    codegen: boolean
  }>()

  const hasCliFlags = Boolean(raw.url && raw.domain && raw.page)

  if (!hasCliFlags) {
    return runInteractiveWizard()
  }

  if (!['ui', 'api', 'e2e'].includes(raw.type)) {
    throw new Error(`Invalid --type "${raw.type}". Use ui, api, or e2e.`)
  }

  return {
    url: raw.url!,
    domain: normalizeDomainName(raw.domain!),
    page: normalizePageName(raw.page!),
    type: raw.type as GeneratorOptions['type'],
    headless: raw.headless,
    overwrite: raw.overwrite,
    explore: !raw.noExplore,
    noCodegen: raw.codegen === false,
    ...(raw.storageState ? { storageState: raw.storageState } : {}),
    ...(raw.codegenFile ? { codegenFile: raw.codegenFile } : {}),
  }
}

async function main(): Promise<void> {
  const opts = await resolveOptions()

  printBanner(opts)
  await runGeneration(opts)
}

async function runGeneration(opts: GeneratorOptions): Promise<void> {
  const totalSteps = opts.explore ? 8 : 7
  let step = 0

  if (opts.explore) {
    step += 1
    log('step', `${step}/${totalSteps}  Exploring page (click-through + modal scan)…`)
  }

  step += 1
  log('step', `${step}/${totalSteps}  Analysing page DOM…`)

  const result = await runCodegenPipeline(opts)

  log('success', `     ✓  Found elements and wrote artifacts`)
  if (result.lowConfidenceCount > 0) {
    log('warn', `     ${result.lowConfidenceCount} locator(s) have LOW confidence`)
  } else {
    log('success', '     ✓  All locators are high/medium confidence')
  }
  log('success', `     ✓  ${result.totalCases} test case(s) [pattern: ${result.pattern}]`)
  log('success', `     ✓  ${relativePath(result.pomPath)}`)
  log('success', `     ✓  ${relativePath(result.fixturePath)}`)
  log('success', `     ✓  ${relativePath(result.specPath)}`)

  printSummary({
    pomPath: result.pomPath,
    specPath: result.specPath,
    totalCases: result.totalCases,
    lowConfidenceCount: result.lowConfidenceCount,
  })
}

type LogLevel = 'step' | 'info' | 'warn' | 'success' | 'error'

function log(level: LogLevel, msg: string): void {
  const prefix: Record<LogLevel, string> = {
    step: '\n\x1b[36m[→]\x1b[0m',
    info: '   \x1b[90m',
    warn: '   \x1b[33m⚠ ',
    success: '   \x1b[32m',
    error: '\x1b[31m[✗]',
  }
  process.stdout.write(`${prefix[level]} ${msg}\x1b[0m\n`)
}

function printBanner(o: GeneratorOptions): void {
  console.log(`
\x1b[1m╔═══════════════════════════════════════╗
║   codegen-agent  v1.0.0               ║
╚═══════════════════════════════════════╝\x1b[0m
  URL      : ${o.url}
  Domain   : ${o.domain}
  Page     : ${o.page}
  Type     : ${o.type}
  Explore  : ${o.explore ? 'yes (default)' : 'no (--no-explore)'}
  Overwrite: ${o.overwrite}
  Headless : ${o.headless}
${o.storageState ? `  Auth     : ${o.storageState}` : ''}
`)
}

function printSummary(o: {
  pomPath: string
  specPath: string
  totalCases: number
  lowConfidenceCount: number
}): void {
  const locatorNote =
    o.lowConfidenceCount > 0
      ? `  \x1b[33m⚠  ${o.lowConfidenceCount} locator(s) have LOW confidence.\x1b[0m
     Add \x1b[1mdata-testid\x1b[0m attributes and re-run the generator.
`
      : '  \x1b[32mAll locators are high/medium confidence.\x1b[0m\n'

  console.log(`
\x1b[1m═══════════════════════════════════════\x1b[0m
  POM  : ${relativePath(o.pomPath)}
  Spec : ${relativePath(o.specPath)}
  Cases: ${o.totalCases}
${locatorNote}
  Next steps:
    1. Review generated files and adapt assertions
    2. Run: \x1b[1mnpm run validate:conventions -- --domain ${path.basename(path.dirname(o.specPath))}\x1b[0m
    3. Commit when green.
`)
}

function relativePath(absPath: string): string {
  return path.relative(AUTOMATION_ROOT, absPath)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\n\x1b[31m[✗] Fatal error: ${message}\x1b[0m\n`)
  process.exit(1)
})
