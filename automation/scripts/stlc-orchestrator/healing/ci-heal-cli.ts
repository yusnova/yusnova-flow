#!/usr/bin/env ts-node
/**
 * Builds self-healing proposals directly from a Playwright failure log,
 * without needing a live URL/page (unlike the full stlc:orchestrator run).
 * Intended for CI nightly regression runs: when the full suite fails on a
 * locator, this creates a minimal STLC run containing only the healing
 * proposals so a human can review/apply them with `npm run healing:review`.
 *
 * Usage:
 *   npx ts-node scripts/stlc-orchestrator/healing/ci-heal-cli.ts \
 *     --domain example --log-file playwright-output.txt
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Command } from 'commander'
import { buildAutoHealProposals } from './auto-healer'
import { isLocatorFailure } from './selector-healer'
import { saveState } from '../state/pipeline-state'
import { log } from '../terminal'
import { StlcSharedState } from '../types'

const AUTOMATION_ROOT = path.resolve(__dirname, '..', '..', '..')
const DEFAULT_OUTPUT = path.join(AUTOMATION_ROOT, 'tmp/stlc')

function buildProgram(): Command {
  return new Command()
    .name('ci-heal')
    .description('Build self-healing proposals from a CI failure log (no URL required)')
    .requiredOption('--domain <name>', 'domain that failed')
    .requiredOption('--log-file <path>', 'path to Playwright stdout/stderr log')
    .option('--pom-file <path>', 'explicit POM file path (defaults to pages/<domain>-page.ts)')
    .option('--output-dir <path>', 'STLC state output directory', DEFAULT_OUTPUT)
}

function createBareState(domain: string): StlcSharedState {
  return {
    runId: `ci-nightly-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`,
    requirementText: '',
    ambiguityFlags: [],
    testabilityScore: 0,
    acceptanceCriteria: [],
    testScope: { inScope: [domain], outOfScope: [], riskMatrix: [] },
    testCases: [],
    executionResults: [],
    defects: [],
    humanGates: [],
    qualityGate: {
      decision: 'pending',
      blockingReasons: [],
      coveragePercent: 0,
      openP0Count: 0,
      recommendation: '',
      confidence: 0,
    },
    auditTrail: [],
    healingProposals: [],
    currentPhase: 'done',
  }
}

function main(): void {
  const program = buildProgram()
  program.parse(process.argv)
  const opts = program.opts<{ domain: string; logFile: string; pomFile?: string; outputDir: string }>()

  const failureLog = fs.readFileSync(path.resolve(opts.logFile), 'utf-8')
  if (!isLocatorFailure(failureLog)) {
    log('info', 'No locator-related failures detected in log — nothing to heal.')
    return
  }

  const pomPath = opts.pomFile
    ? path.resolve(opts.pomFile)
    : path.join(AUTOMATION_ROOT, 'pages', `${opts.domain}-page.ts`)

  const proposals = buildAutoHealProposals(failureLog, AUTOMATION_ROOT, opts.domain, pomPath)
  if (proposals.length === 0) {
    log('info', 'Locator failure detected but no codebase-informed fix could be derived. Manual triage required.')
    return
  }

  const bare = createBareState(opts.domain)
  const state: StlcSharedState = {
    ...bare,
    healingProposals: proposals,
    humanGates: [
      {
        phase: 'execution',
        status: 'pending',
        reason: `${proposals.length} self-healing proposal(s) from nightly CI run require human approval`,
        requiredFor: proposals.map((proposal) => proposal.id),
      },
    ],
    auditTrail: [
      {
        phase: 'execution',
        agent: 'ci-heal-cli',
        action: 'proposed_healing_from_ci_log',
        reason: `Derived ${proposals.length} proposal(s) for domain "${opts.domain}" from nightly failure log`,
        confidence: 0.7,
        timestamp: new Date().toISOString(),
      },
    ],
  }

  const statePath = saveState(state, path.resolve(opts.outputDir))
  log('success', `${proposals.length} healing proposal(s) saved. Review with: npm run healing:review -- --run ${state.runId}`)
  console.log(`STLC_HEAL_RUN_ID=${state.runId}`)
  console.log(`STLC_HEAL_STATE_PATH=${statePath}`)
}

main()
