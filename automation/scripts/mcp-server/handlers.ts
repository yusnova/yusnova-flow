/**
 * Framework-agnostic handler functions backing the MCP server (server.ts)
 * and reusable by the dashboard's HTTP API. Kept free of any MCP-specific
 * types so they can be unit-tested in isolation and so the dashboard doesn't
 * need to depend on the MCP SDK.
 *
 * SAFETY CONTRACT: exactly like the CLI, only `approveProposal` /
 * `approveAllProposals` are allowed to touch POM/spec files, and only when
 * explicitly invoked (i.e. a human — via chat, dashboard click, or terminal —
 * asked for that specific proposal to be approved). No handler here runs a
 * full pipeline phase or applies a healing fix as a side effect of a
 * read-only query.
 */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { normalizeDomainName } from '@codegen-agent/naming/domain-name'
import { normalizePageName } from '@codegen-agent/naming/page-name'
import { GeneratorOptions } from '../codegen-agent/types'
import { ExploreOrchestrator } from '../explorer-agent/orchestrator'
import { createInitialExploreState, saveExploreState } from '../explorer-agent/state'
import { ExplorationReport, ExploreOrchestratorOptions } from '../explorer-agent/types'
import { analyzeTestImpact, listAllDomains } from '../shared/test-impact-analysis'
import { TestHistoryTracker } from '../stlc-orchestrator/flaky/test-history'
import { approveAllProposals, approveProposal, rejectProposal } from '../stlc-orchestrator/healing/proposal-actions'
import { StlcOrchestrator } from '../stlc-orchestrator/orchestrator'
import { PR_PHASES, FULL_PHASES } from '../stlc-orchestrator/profiles'
import { shouldAutoSynthesizeRequirements, synthesizeRequirements } from '../stlc-orchestrator/requirement-synthesizer'
import { createInitialState, loadState, saveState } from '../stlc-orchestrator/state/pipeline-state'
import { HealingProposal, OrchestratorOptions, StlcSharedState } from '../stlc-orchestrator/types'

export const AUTOMATION_ROOT = path.resolve(__dirname, '..', '..')
export const REPO_ROOT = path.resolve(AUTOMATION_ROOT, '..')
export const DEFAULT_OUTPUT = path.join(AUTOMATION_ROOT, 'tmp/stlc')

function safeReadState(outputDir: string, runId: string): StlcSharedState | null {
  try {
    return loadState(outputDir, runId)
  } catch {
    return null
  }
}

function listRunDirs(outputDir: string): string[] {
  if (!fs.existsSync(outputDir)) return []
  return fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

export interface RunSummary {
  runId: string
  domain: string
  decision: string
  coveragePercent: number
  testCaseCount: number
  pendingHumanGates: number
  pendingHealingProposals: number
  flakyTestCount: number
  currentPhase: string
  updatedAt: string
  statePath: string
  reportPath: string
}

function summarizeRun(outputDir: string, runId: string): RunSummary | null {
  const statePath = path.join(outputDir, runId, 'state.json')
  if (!fs.existsSync(statePath)) return null
  const state = safeReadState(outputDir, runId)
  if (!state) return null

  const lastAudit = state.auditTrail[state.auditTrail.length - 1]
  const stat = fs.statSync(statePath)

  return {
    runId: state.runId,
    domain: state.testScope.inScope[0] ?? state.runId,
    decision: state.qualityGate.decision,
    coveragePercent: state.qualityGate.coveragePercent,
    testCaseCount: state.testCases.length,
    pendingHumanGates: state.humanGates.filter((gate) => gate.status === 'pending').length,
    pendingHealingProposals: (state.healingProposals ?? []).filter((proposal) => proposal.status === 'pending_human').length,
    flakyTestCount: (state.flakyTests ?? []).filter((entry) => entry.recommendation !== 'stable').length,
    currentPhase: state.currentPhase,
    updatedAt: lastAudit?.timestamp ?? stat.mtime.toISOString(),
    statePath,
    reportPath: path.join(outputDir, runId, 'quality-report.md'),
  }
}

/** Lists recent STLC runs, most-recently-updated first. */
export function listRuns(outputDir: string = DEFAULT_OUTPUT, limit = 20): RunSummary[] {
  const runs = listRunDirs(outputDir)
    .map((runId) => summarizeRun(outputDir, runId))
    .filter((entry): entry is RunSummary => entry !== null)

  runs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return runs.slice(0, limit)
}

export function getRun(runId: string, outputDir: string = DEFAULT_OUTPUT): StlcSharedState {
  return loadState(outputDir, runId)
}

export function getRunReport(runId: string, outputDir: string = DEFAULT_OUTPUT): string {
  const reportPath = path.join(outputDir, runId, 'quality-report.md')
  if (!fs.existsSync(reportPath)) {
    throw new Error(`No quality-report.md found for run "${runId}" (looked in ${reportPath})`)
  }
  return fs.readFileSync(reportPath, 'utf-8')
}

export interface HealingProposalWithRun {
  runId: string
  proposal: HealingProposal
}

/** Lists healing proposals across one run or every run, optionally filtered by status. */
export function listHealingProposals(opts: {
  runId?: string | undefined
  status?: HealingProposal['status'] | 'all' | undefined
  outputDir?: string | undefined
} = {}): HealingProposalWithRun[] {
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT
  const status = opts.status ?? 'pending_human'
  const runIds = opts.runId ? [opts.runId] : listRunDirs(outputDir)

  const results: HealingProposalWithRun[] = []
  for (const runId of runIds) {
    const state = safeReadState(outputDir, runId)
    if (!state) continue
    for (const proposal of state.healingProposals ?? []) {
      if (status !== 'all' && proposal.status !== status) continue
      results.push({ runId, proposal })
    }
  }
  return results
}

export interface ProposalDecisionResult {
  runId: string
  proposalId: string
  outcome: string
  message: string
}

/**
 * Approves ONE healing proposal by id and applies it to the POM/spec file.
 * This is only safe to call when a human explicitly requested this specific
 * proposal be approved (e.g. asked the agent "approve HEAL-123 for run X").
 */
export function approveHealingProposal(
  runId: string,
  proposalId: string,
  reasonNote?: string,
  outputDir: string = DEFAULT_OUTPUT,
): ProposalDecisionResult {
  const state = loadState(outputDir, runId)
  const result = approveProposal(state, proposalId, AUTOMATION_ROOT, reasonNote)
  if (result.outcome !== 'not_found') saveState(result.state, outputDir)
  return { runId, proposalId, outcome: result.outcome, message: result.message }
}

export function rejectHealingProposal(
  runId: string,
  proposalId: string,
  reasonNote?: string,
  outputDir: string = DEFAULT_OUTPUT,
): ProposalDecisionResult {
  const state = loadState(outputDir, runId)
  const result = rejectProposal(state, proposalId, reasonNote)
  if (result.outcome !== 'not_found') saveState(result.state, outputDir)
  return { runId, proposalId, outcome: result.outcome, message: result.message }
}

export function approveAllHealingProposals(
  runId: string,
  minConfidence = 0.75,
  outputDir: string = DEFAULT_OUTPUT,
): ProposalDecisionResult[] {
  const state = loadState(outputDir, runId)
  const { state: nextState, results } = approveAllProposals(state, AUTOMATION_ROOT, minConfidence)
  saveState(nextState, outputDir)
  return results.map(({ proposalId, result }) => ({ runId, proposalId, outcome: result.outcome, message: result.message }))
}

export interface FlakyReportEntry {
  caseId: string
  domain: string
  flakyScore: number
  sampleSize: number
  lastStatuses: string[]
  recommendation: string
}

export function flakyReport(domain?: string, minScore = 0.3): FlakyReportEntry[] {
  return new TestHistoryTracker().flakyTests(domain, minScore)
}

export function testImpact(changedFiles: string[]): ReturnType<typeof analyzeTestImpact> {
  return analyzeTestImpact(changedFiles, REPO_ROOT)
}

export function domains(): string[] {
  return listAllDomains(AUTOMATION_ROOT)
}

export interface ValidateResult {
  success: boolean
  output: string
}

/** Runs the convention validator for a single domain (spawns the existing CLI). */
export function validateDomain(domain: string): ValidateResult {
  const result = spawnSync(
    'npx',
    ['ts-node', 'scripts/validator/test-validator.ts', '--domain', domain],
    { cwd: AUTOMATION_ROOT, encoding: 'utf-8', timeout: 60_000 },
  )
  return {
    success: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  }
}

export interface ExploreBugsParams {
  url: string
  domain?: string | undefined
  maxPages?: number | undefined
  maxActionsPerPage?: number | undefined
  headless?: boolean | undefined
  sameOriginOnly?: boolean | undefined
  storageState?: string | undefined
  outputDir?: string | undefined
  ingestRag?: boolean | undefined
  skipHumanGates?: boolean | undefined
}

/**
 * Runs the explore:bugs mini-orchestrator (setup → crawl → triage → review →
 * reporting → rag). Complements — does not replace — the scripted STLC pipeline.
 */
export async function exploreBugs(params: ExploreBugsParams): Promise<ExplorationReport & { statePath: string }> {
  const options: ExploreOrchestratorOptions = {
    url: params.url,
    domain: params.domain ?? 'explored',
    headless: params.headless ?? true,
    maxPages: params.maxPages ?? 5,
    maxActionsPerPage: params.maxActionsPerPage ?? 15,
    sameOriginOnly: params.sameOriginOnly ?? true,
    outputDir: params.outputDir ? path.resolve(params.outputDir) : path.join(DEFAULT_OUTPUT, 'exploration'),
    ingestRag: params.ingestRag ?? false,
    skipHumanGates: params.skipHumanGates ?? true,
    ...(params.storageState ? { storageState: params.storageState } : {}),
  }

  const initial = createInitialExploreState(options)
  saveExploreState(initial, options.outputDir)
  const result = await new ExploreOrchestrator().run(initial, options)

  return {
    runId: result.state.runId,
    startUrl: result.state.url,
    pagesVisited: result.state.pagesVisited,
    actionsPerformed: result.state.actionsPerformed,
    anomalies: result.state.anomalies,
    outputDir: path.join(options.outputDir, result.state.runId),
    reportPath: result.reportPath || path.join(options.outputDir, result.state.runId, 'exploration-report.md'),
    jsonPath: result.state.jsonPath ?? path.join(options.outputDir, result.state.runId, 'anomalies.json'),
    screenshotsDir: result.state.screenshotsDir ?? path.join(options.outputDir, result.state.runId, 'screenshots'),
    statePath: result.statePath,
  }
}

export interface RunPipelineParams {
  url: string
  domain: string
  page: string
  type?: 'ui' | 'api' | 'e2e' | undefined
  requirementText?: string | undefined
  requirementFile?: string | undefined
  profile?: 'pr' | 'full' | undefined
  runTests?: boolean | undefined
  overwrite?: boolean | undefined
  headless?: boolean | undefined
  explore?: boolean | undefined
  skipHumanGates?: boolean | undefined
  enableLlm?: boolean | undefined
  enableRag?: boolean | undefined
  enableSelfHealing?: boolean | undefined
  outputDir?: string | undefined
}

export interface RunPipelineResult {
  runId: string
  decision: string
  coveragePercent: number
  testCaseCount: number
  pendingHumanGates: number
  pendingHealingProposals: string[]
  statePath: string
  reportPath: string
  codegenArtifacts?: { pomPath: string; specPath: string }
  recommendation: string
}

/**
 * Runs the agentic STLC pipeline end-to-end (or the `pr` profile subset).
 * This is the heaviest tool exposed by the MCP server: it drives a real
 * browser via Playwright, so it can take anywhere from ~20s to a few minutes
 * depending on `runTests` and page complexity.
 */
export async function runPipeline(params: RunPipelineParams): Promise<RunPipelineResult> {
  const outputDir = params.outputDir ? path.resolve(params.outputDir) : DEFAULT_OUTPUT
  const type = params.type ?? 'ui'
  if (!['ui', 'api', 'e2e'].includes(type)) {
    throw new Error(`Invalid type "${type}". Use ui, api, or e2e.`)
  }

  const codegen: GeneratorOptions = {
    url: params.url,
    domain: normalizeDomainName(params.domain),
    page: normalizePageName(params.page),
    type,
    headless: params.headless ?? true,
    overwrite: params.overwrite ?? false,
    explore: params.explore ?? true,
    noCodegen: false,
  }

  const profile = params.profile ?? 'pr'
  const phases = profile === 'full' ? FULL_PHASES : PR_PHASES

  let requirementText = params.requirementFile
    ? fs.readFileSync(path.resolve(params.requirementFile), 'utf-8')
    : (params.requirementText?.trim() ?? '')

  const options: OrchestratorOptions = {
    requirementText,
    ...(params.requirementFile ? { requirementFile: params.requirementFile } : {}),
    codegen,
    phases,
    skipHumanGates: params.skipHumanGates ?? false,
    runTests: params.runTests ?? profile === 'full',
    enableLlm: params.enableLlm ?? true,
    enableRag: params.enableRag ?? true,
    enableSelfHealing: params.enableSelfHealing ?? true,
    outputDir,
    humanConfidenceThreshold: 0.75,
  }

  if (shouldAutoSynthesizeRequirements(requirementText, params.requirementFile)) {
    const synthesized = await synthesizeRequirements({
      url: codegen.url,
      domain: codegen.domain,
      headless: codegen.headless,
      repoRoot: REPO_ROOT,
    })
    requirementText = synthesized.text
    options.requirementText = requirementText
  }

  const initialState = createInitialState(requirementText, options)
  const orchestrator = new StlcOrchestrator()
  const result = await orchestrator.run(initialState, options)

  return {
    runId: result.state.runId,
    decision: result.state.qualityGate.decision,
    coveragePercent: result.state.qualityGate.coveragePercent,
    testCaseCount: result.state.testCases.length,
    pendingHumanGates: result.state.humanGates.filter((gate) => gate.status === 'pending').length,
    pendingHealingProposals: (result.state.healingProposals ?? [])
      .filter((proposal) => proposal.status === 'pending_human')
      .map((proposal) => proposal.id),
    statePath: result.statePath,
    reportPath: result.reportPath,
    recommendation: result.state.qualityGate.recommendation,
    ...(result.state.codegenArtifacts
      ? {
          codegenArtifacts: {
            pomPath: result.state.codegenArtifacts.pomPath,
            specPath: result.state.codegenArtifacts.specPath,
          },
        }
      : {}),
  }
}
