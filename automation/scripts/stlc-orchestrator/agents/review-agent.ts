import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { appendAudit } from '../state/pipeline-state'
import { AgentResult, DesignedTestCase, HumanGate, OrchestratorOptions, StlcSharedState } from '../types'

function shouldApproveForCodegen(
  testCase: DesignedTestCase,
  options: OrchestratorOptions,
  needsHuman: boolean,
  threshold: number,
): boolean {
  if (options.skipHumanGates) return true
  if (!needsHuman) return true
  return testCase.confidence >= threshold || testCase.type === 'happy-path'
}

export interface ReviewIssueSummary {
  uncoveredAcIds: string[]
  duplicatePairs: Array<[string, string]>
  lowConfidenceIds: string[]
}

function duplicatePairs(titles: string[]): Array<[string, string]> {
  const dupes: Array<[string, string]> = []
  for (let i = 0; i < titles.length; i += 1) {
    for (let j = i + 1; j < titles.length; j += 1) {
      const a = titles[i]!.toLowerCase().trim()
      const b = titles[j]!.toLowerCase().trim()
      if (a === b) dupes.push([titles[i]!, titles[j]!])
    }
  }
  return dupes
}

function truncateTitle(title: string, max = 52): string {
  const stripped = title.replace(/^Verify AC:\s*/i, '').trim()
  return stripped.length <= max ? stripped : `${stripped.slice(0, max - 1)}…`
}

function formatIdList(ids: string[], preview = 5): string {
  if (ids.length <= preview) return ids.join(', ')
  return `${ids.slice(0, preview).join(', ')} … +${ids.length - preview} more`
}

export function formatReviewIssuesForTerminal(summary: ReviewIssueSummary): {
  headline: string
  bullets: string[]
} {
  const total =
    summary.uncoveredAcIds.length +
    summary.duplicatePairs.length +
    summary.lowConfidenceIds.length

  const bullets: string[] = []

  if (summary.uncoveredAcIds.length > 0) {
    bullets.push(`Uncovered AC: ${formatIdList(summary.uncoveredAcIds, 4)}`)
  }

  if (summary.duplicatePairs.length > 0) {
    bullets.push(`${summary.duplicatePairs.length} exact duplicate title pair(s)`)
    for (const [a] of summary.duplicatePairs.slice(0, 2)) {
      bullets.push(`e.g. «${truncateTitle(a)}»`)
    }
    if (summary.duplicatePairs.length > 2) {
      bullets.push(`… +${summary.duplicatePairs.length - 2} more pair(s)`)
    }
  }

  if (summary.lowConfidenceIds.length > 0) {
    bullets.push(`Low confidence: ${formatIdList(summary.lowConfidenceIds)}`)
  }

  return {
    headline: total === 0 ? 'No coverage gaps or duplicate cases detected' : `Design review flagged ${total} issue(s)`,
    bullets,
  }
}

export function formatReviewIssuesForReport(summary: ReviewIssueSummary): string[] {
  if (
    summary.uncoveredAcIds.length === 0 &&
    summary.duplicatePairs.length === 0 &&
    summary.lowConfidenceIds.length === 0
  ) {
    return ['- None']
  }

  const lines: string[] = []
  if (summary.uncoveredAcIds.length > 0) {
    lines.push(`- Uncovered AC (${summary.uncoveredAcIds.length}): ${summary.uncoveredAcIds.join(', ')}`)
  }
  if (summary.duplicatePairs.length > 0) {
    for (const [a, b] of summary.duplicatePairs) {
      lines.push(`- Duplicate: «${truncateTitle(a, 80)}» / «${truncateTitle(b, 80)}»`)
    }
  }
  if (summary.lowConfidenceIds.length > 0) {
    lines.push(`- Low confidence (${summary.lowConfidenceIds.length}): ${summary.lowConfidenceIds.join(', ')}`)
  }
  return lines
}

export async function runReviewDesignAgent(
  state: StlcSharedState,
  options: OrchestratorOptions,
): Promise<AgentResult> {
  const pendingDesignGate = state.humanGates.find(
    (gate) => gate.phase === 'review_design' && gate.status === 'pending',
  )
  const hasApprovedCases = state.testCases.some(
    (testCase) => testCase.status === 'approved' || testCase.status === 'automated',
  )

  if (pendingDesignGate && !hasApprovedCases && !options.skipHumanGates) {
    const awaiting = appendAudit(
      { ...state, currentPhase: 'reporting' },
      {
        phase: 'review_design',
        agent: 'review-agent',
        action: 'awaiting_human_approval',
        reason:
          'Human gate still pending — cannot approve cases automatically. Use --skip-human-gates for local POC.',
        confidence: 1,
      },
    )
    return { nextPhase: 'reporting', state: awaiting }
  }

  const threshold = options.humanConfidenceThreshold ?? 0.75
  const uncovered = state.acceptanceCriteria.filter(
    (ac) => ac.testable && ac.mappedTestCaseIds.length === 0,
  )
  const dupes = duplicatePairs(state.testCases.map((tc) => tc.title))
  const lowConfidence = state.testCases.filter((tc) => tc.confidence < threshold)

  const issueSummary: ReviewIssueSummary = {
    uncoveredAcIds: uncovered.map((ac) => ac.id),
    duplicatePairs: dupes,
    lowConfidenceIds: lowConfidence.map((tc) => tc.id),
  }

  const issueCount =
    issueSummary.uncoveredAcIds.length +
    issueSummary.duplicatePairs.length +
    issueSummary.lowConfidenceIds.length

  const { headline } = formatReviewIssuesForTerminal(issueSummary)

  const humanGates: HumanGate[] = [...state.humanGates]
  const needsHuman = issueCount > 0 || state.testCases.some((tc) => tc.priority === 'P0')

  const alreadyHasDesignGate = humanGates.some(
    (gate) => gate.phase === 'review_design' && gate.status === 'pending',
  )

  if (needsHuman && !options.skipHumanGates && !alreadyHasDesignGate) {
    humanGates.push({
      phase: 'review_design',
      status: 'pending',
      reason: issueCount > 0
        ? `Design review flagged ${issueCount} issue(s)`
        : 'P0 test cases require human approval',
      requiredFor: state.testCases.filter((tc) => tc.priority === 'P0').map((tc) => tc.id),
    })
  }

  const reviewedCases = state.testCases.map((tc) => ({
    ...tc,
    status: shouldApproveForCodegen(tc, options, needsHuman, threshold) ? ('approved' as const) : tc.status,
  }))

  const next = appendAudit(
    {
      ...state,
      testCases: reviewedCases,
      humanGates,
      currentPhase: 'codegen',
    },
    {
      phase: 'review_design',
      agent: 'review-agent',
      action: 'reviewed_design',
      reason: headline,
      confidence: issueCount === 0 ? 0.9 : 0.65,
      inputs: { issueSummary },
    },
  )

  return { nextPhase: 'codegen', state: next }
}

export async function runReviewCodeAgent(
  state: StlcSharedState,
  options: OrchestratorOptions,
): Promise<AgentResult> {
  const automationRoot = path.resolve(__dirname, '..', '..', '..')
  const domain = options.codegen.domain
  const result = spawnSync('npm', ['run', 'validate', '--', '--domain', domain], {
    cwd: automationRoot,
    encoding: 'utf-8',
  })

  const passed = result.status === 0
  const humanGates: HumanGate[] = [...state.humanGates]

  if (!passed && !options.skipHumanGates) {
    humanGates.push({
      phase: 'review_code',
      status: 'pending',
      reason: 'Convention validator reported issues in generated artifacts',
      requiredFor: [state.codegenArtifacts?.specPath ?? 'spec'],
    })
  }

  const automatedCases = state.testCases.map((tc) => ({
    ...tc,
    status: passed ? 'automated' as const : tc.status,
  }))

  const next = appendAudit(
    {
      ...state,
      testCases: automatedCases,
      humanGates,
      currentPhase: 'execution',
    },
    {
      phase: 'review_code',
      agent: 'review-agent',
      action: 'validated_generated_code',
      reason: passed ? 'Validator passed for generated domain artifacts' : 'Validator failed',
      confidence: passed ? 0.92 : 0.5,
      inputs: { stdout: result.stdout, stderr: result.stderr },
    },
  )

  return { nextPhase: 'execution', state: next }
}
