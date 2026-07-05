import { createLlmClient, parseJsonResponse } from '../llm/llm-client'
import { findingsMissingFromRequirements } from '../../shared/codebase-scanner'
import { appendAudit } from '../state/pipeline-state'
import { AgentResult, DesignedTestCase, OrchestratorOptions, StlcSharedState, TestLevel } from '../types'

function levelForCase(title: string, scopeLevel: TestLevel): TestLevel {
  const lower = title.toLowerCase()
  if (scopeLevel === 'api') return 'api'
  if (lower.includes('api') || lower.includes('status') || lower.includes('token')) return 'api'
  return 'ui'
}

function negativeVariants(baseTitle: string): DesignedTestCase[] {
  return [
    {
      id: '',
      title: `${baseTitle} with invalid input`,
      level: 'ui',
      type: 'negative',
      priority: 'P1',
      acceptanceCriteriaIds: [],
      steps: ['Provide invalid data', 'Submit action', 'Assert validation error'],
      status: 'draft',
      confidence: 0.7,
      reason: 'Negative path required by test design policy',
    },
    {
      id: '',
      title: `${baseTitle} with empty required fields`,
      level: 'ui',
      type: 'negative',
      priority: 'P1',
      acceptanceCriteriaIds: [],
      steps: ['Leave required fields empty', 'Submit', 'Assert blocked submission'],
      status: 'draft',
      confidence: 0.72,
      reason: 'Empty-state negative coverage',
    },
    {
      id: '',
      title: `${baseTitle} with boundary values`,
      level: 'ui',
      type: 'boundary',
      priority: 'P2',
      acceptanceCriteriaIds: [],
      steps: ['Use min/max boundary input', 'Submit', 'Assert expected boundary behaviour'],
      status: 'draft',
      confidence: 0.68,
      reason: 'Boundary value analysis',
    },
  ]
}

interface LlmDesignResult {
  testCases: Array<{
    id: string
    title: string
    level: TestLevel
    type: DesignedTestCase['type']
    priority: DesignedTestCase['priority']
    acceptanceCriteriaIds: string[]
    steps: string[]
    confidence: number
    reason: string
  }>
  rationale: string
}

async function llmDesignCases(state: StlcSharedState, defaultLevel: TestLevel): Promise<DesignedTestCase[]> {
  const llm = createLlmClient()
  const response = await llm.complete({
    temperature: 0.25,
    responseFormat: 'json',
    messages: [
      {
        role: 'system',
        content: [
          'You are a test design expert. Apply equivalence partitioning, boundary values, and at least 3 negative cases per P0/P1 happy path.',
          'Enforce test pyramid: use api level when behaviour is API-verifiable, otherwise ui.',
          'Return JSON { testCases[], rationale }.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          acceptanceCriteria: state.acceptanceCriteria,
          riskMatrix: state.testScope.riskMatrix,
          ragMatches: state.ragMatches ?? [],
          defaultLevel,
        }),
      },
    ],
  })

  const parsed = parseJsonResponse<LlmDesignResult>(response.content)
  return parsed.testCases.map((tc) => ({
    ...tc,
    status: 'draft' as const,
  }))
}

export async function runDesignAgent(
  state: StlcSharedState,
  options: OrchestratorOptions,
): Promise<AgentResult> {
  const defaultLevel = state.testScope.riskMatrix[0]?.recommendedLevel ?? 'ui'
  const useLlm = options.enableLlm !== false && createLlmClient().isEnabled()
  let designed: DesignedTestCase[] = []
  let designReason = ''

  if (useLlm) {
    designed = await llmDesignCases(state, defaultLevel)
    designReason = `LLM produced ${designed.length} designed cases with pyramid enforcement`
  } else {
    for (const ac of state.acceptanceCriteria) {
      if (!ac.testable) continue
      const baseId = `TC-${designed.length + 1}`
      const happy: DesignedTestCase = {
        id: `${baseId}-HP`,
        title: `Verify ${ac.text}`,
        level: levelForCase(ac.text, defaultLevel),
        type: 'happy-path',
        priority: ac.text.toLowerCase().includes('must') ? 'P0' : 'P1',
        acceptanceCriteriaIds: [ac.id],
        steps: ['Navigate to target page', 'Perform primary action', 'Assert expected outcome'],
        status: 'draft',
        confidence: 0.85,
        reason: `Mapped from ${ac.id} with happy-path coverage`,
      }
      designed.push(happy)

      if (happy.priority === 'P0' || happy.priority === 'P1') {
        const negatives = negativeVariants(happy.title).map((entry, index) => ({
          ...entry,
          id: `${baseId}-N${index + 1}`,
          level: happy.level,
          acceptanceCriteriaIds: [ac.id],
        }))
        designed.push(...negatives)
      }
    }
    designReason = `Heuristic design produced ${designed.length} cases including negative/boundary variants`
  }

  if (state.codebaseInsights) {
    const gaps = findingsMissingFromRequirements(
      state.codebaseInsights.findings,
      state.requirementText,
      designed.map((testCase) => testCase.title),
    )
    let codeIdx = designed.length
    for (const finding of gaps.slice(0, 8)) {
      codeIdx += 1
      designed.push({
        id: `TC-CB-${codeIdx}`,
        title: finding.suggestedTestTitle,
        level: finding.suggestedLevel === 'api' ? 'api' : finding.suggestedLevel === 'e2e' ? 'e2e' : 'ui',
        type: finding.category === 'unstable' ? 'edge' : finding.category === 'integration' ? 'happy-path' : 'happy-path',
        priority: finding.severity === 'critical' ? 'P0' : finding.severity === 'high' ? 'P1' : 'P2',
        acceptanceCriteriaIds: [],
        steps: [
          `Inspect ${finding.filePath}`,
          `Exercise ${finding.category} scenario from codebase discovery`,
          'Assert expected workflow or integration behaviour',
        ],
        status: 'draft',
        confidence: 0.78,
        reason: `Codebase gap (not in requirements): ${finding.summary}`,
      })
    }
    if (gaps.length > 0) {
      designReason += ` + ${Math.min(gaps.length, 8)} case(s) from frontend/backend discovery`
    }
  }

  if (designed.length === 0) {
    designed.push({
      id: 'TC-001-HP',
      title: `Smoke test for ${options.codegen.domain} page`,
      level: defaultLevel,
      type: 'happy-path',
      priority: 'P1',
      acceptanceCriteriaIds: [],
      steps: ['Open page', 'Interact with primary controls', 'Assert page is usable'],
      status: 'draft',
      confidence: 0.75,
      reason: 'Fallback smoke scenario when no structured AC lines were found',
    })
  }

  const mapped = state.acceptanceCriteria.map((ac) => ({
    ...ac,
    mappedTestCaseIds: designed
      .filter((tc) => tc.acceptanceCriteriaIds.includes(ac.id))
      .map((tc) => tc.id),
  }))

  const next = appendAudit(
    {
      ...state,
      acceptanceCriteria: mapped,
      testCases: designed,
      currentPhase: 'review_design',
    },
    {
      phase: 'design',
      agent: 'design-agent',
      action: useLlm ? 'llm_designed_test_cases' : 'heuristic_designed_test_cases',
      reason: designReason || `Produced ${designed.length} cases`,
      confidence: 0.8,
    },
  )

  return { nextPhase: 'review_design', state: next }
}
