import { appendAudit } from '../state/pipeline-state'
import {
  AcceptanceCriterion,
  AgentResult,
  AmbiguityFlag,
  OrchestratorOptions,
  StlcSharedState,
} from '../types'
import { createLlmClient, parseJsonResponse } from '../llm/llm-client'
import { DefectKnowledgeBase, formatRagContext } from '../rag/defect-knowledge'

const UNTESTABLE_PATTERNS = [
  { pattern: /\b(user[- ]?friendly|intuitive|easy to use)\b/i, reason: 'Subjective usability term' },
  { pattern: /\b(fast|quick|responsive)\b/i, reason: 'Performance term without measurable threshold' },
  { pattern: /\b(etc\.?|and so on)\b/i, reason: 'Open-ended enumeration' },
  { pattern: /\b(as needed|if possible|maybe)\b/i, reason: 'Non-committal language' },
]

const AC_LINE = /^(?:AC|Given|When|Then|Acceptance|Criteria)[:\s-]/i

interface LlmRequirementsResult {
  ambiguityFlags: AmbiguityFlag[]
  acceptanceCriteria: Array<{ id: string; text: string; testable: boolean }>
  testabilityScore: number
  rationale: string
}

function heuristicAnalysis(text: string): {
  ambiguityFlags: AmbiguityFlag[]
  acceptanceCriteria: AcceptanceCriterion[]
  testabilityScore: number
} {
  const ambiguityFlags = UNTESTABLE_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ pattern, reason }) => ({
      text: text.match(pattern)?.[0] ?? 'ambiguous phrase',
      reason,
      severity: 'medium' as const,
    }))

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const acceptanceCriteria = lines
    .filter((line) => AC_LINE.test(line) || line.startsWith('- '))
    .map((line, index) => ({
      id: `AC-${String(index + 1).padStart(3, '0')}`,
      text: line.replace(/^-\s*/, ''),
      testable: !UNTESTABLE_PATTERNS.some(({ pattern }) => pattern.test(line)),
      mappedTestCaseIds: [],
    }))

  const testableCount = acceptanceCriteria.filter((ac) => ac.testable).length
  const testabilityScore = acceptanceCriteria.length === 0
    ? Math.max(0.4, 1 - ambiguityFlags.length * 0.1)
    : testableCount / acceptanceCriteria.length

  return { ambiguityFlags, acceptanceCriteria, testabilityScore }
}

async function llmAnalysis(
  text: string,
  ragContext: string,
): Promise<LlmRequirementsResult> {
  const llm = createLlmClient()
  const response = await llm.complete({
    temperature: 0.1,
    responseFormat: 'json',
    messages: [
      {
        role: 'system',
        content: [
          'You are a senior QA analyst. Analyse requirements for testability.',
          'Return JSON: { ambiguityFlags[], acceptanceCriteria[], testabilityScore, rationale }',
          'Flag untestable/subjective phrases. Extract acceptance criteria.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `Requirements:\n${text}\n\nHistorical defect patterns (RAG):\n${ragContext}`,
      },
    ],
  })

  return parseJsonResponse<LlmRequirementsResult>(response.content)
}

export async function runRequirementsAgent(
  state: StlcSharedState,
  options: OrchestratorOptions,
): Promise<AgentResult> {
  const text = state.requirementText.trim()
  const module = options.codegen.domain
  const rag = new DefectKnowledgeBase()
  const ragMatches = options.enableRag === false
    ? []
    : rag.search(text, module)

  const useLlm = options.enableLlm !== false && createLlmClient().isEnabled()
  let ambiguityFlags: AmbiguityFlag[]
  let acceptanceCriteria: AcceptanceCriterion[]
  let testabilityScore: number
  let reason: string
  let confidence: number

  if (useLlm) {
    const llmResult = await llmAnalysis(text, formatRagContext(ragMatches))
    ambiguityFlags = llmResult.ambiguityFlags
    acceptanceCriteria = llmResult.acceptanceCriteria.map((ac) => ({
      ...ac,
      mappedTestCaseIds: [],
    }))
    testabilityScore = llmResult.testabilityScore
    reason = llmResult.rationale
    confidence = Math.min(0.95, llmResult.testabilityScore + 0.1)
  } else {
    const heuristic = heuristicAnalysis(text)
    ambiguityFlags = heuristic.ambiguityFlags
    acceptanceCriteria = heuristic.acceptanceCriteria
    testabilityScore = heuristic.testabilityScore
    reason = `Heuristic analysis: ${ambiguityFlags.length} ambiguity flag(s), ${acceptanceCriteria.length} AC(s)`
    confidence = testabilityScore
  }

  if (ragMatches.length > 0) {
    ambiguityFlags.push({
      text: `Historical risk in module ${module}`,
      reason: `RAG matched ${ragMatches.length} prior defect pattern(s) — add explicit negative cases`,
      severity: 'high',
    })
  }

  const next = appendAudit(
    {
      ...state,
      requirementDocId: state.requirementDocId ?? `REQ-${state.runId.slice(0, 8)}`,
      ambiguityFlags,
      acceptanceCriteria,
      testabilityScore,
      ragMatches: ragMatches.map((match) => ({
        patternId: match.pattern.id,
        score: match.score,
        symptom: match.pattern.symptom,
      })),
      currentPhase: 'planning',
    },
    {
      phase: 'requirements',
      agent: 'requirements-agent',
      action: useLlm ? 'llm_analysed_requirements' : 'heuristic_analysed_requirements',
      reason,
      confidence,
      inputs: { ragMatchCount: ragMatches.length, llm: useLlm },
    },
  )

  return { nextPhase: 'planning', state: next }
}
