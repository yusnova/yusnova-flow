import { createLlmClient, parseJsonResponse } from '../llm/llm-client'
import { findingsMissingFromRequirements } from '../../shared/codebase-scanner'
import { isFindingRelevantToDomain } from '../requirement-synthesizer'
import {
  acAwareNegativeVariants,
  selectorDrivenCases,
} from '../design/heuristic-enrichment'
import { appendAudit } from '../state/pipeline-state'
import { AgentResult, DesignedTestCase, OrchestratorOptions, StlcSharedState, TestLevel } from '../types'

function levelForCase(title: string, _scopeLevel: TestLevel): TestLevel {
  const lower = title.toLowerCase()
  // Only mark as API when the AC itself is about an HTTP contract — do not
  // inherit "api" from domain risk (booking/checkout are still UI funnels).
  if (/\bapi\b/.test(lower) || /\bendpoint\b|\bstatus\b|\btoken\b|\bjson\b/.test(lower)) {
    return 'api'
  }
  return 'ui'
}

/** Interactive ACs (fill/submit/select/lookup/confirm/search) deserve negatives. */
const INTERACTIVE_AC = /submit|form|login|register|password|required|invalid|empty|enter|input|select|choose|lookup|search|confirm|book|add|apply|postcode|valid|field|upload|waste|skip|address|manual/i
/** Read-only ACs (view/open/navigate/display) don't need negative form variants. */
const READONLY_AC = /^(?:user can )?(?:view|open|see|display|navigate|return to|read|browse|page shows)\b/i

function shouldAddNegativeVariants(acText: string): boolean {
  const lower = acText.toLowerCase()
  if (READONLY_AC.test(lower)) return false
  if (/\bapi\b/.test(lower) && /returns|responds|accepts/.test(lower)) return false
  return INTERACTIVE_AC.test(lower)
}

function stepsForAc(acText: string): string[] {
  const lower = acText.toLowerCase()
  if (/postcode|look\s*up|address/.test(lower)) {
    return [
      'Open the booking / address step',
      'Enter a valid fixture postcode (e.g. SW1A 1AA)',
      'Click lookup and select an address',
      'Assert addresses (or manual path) are available and Continue unlocks',
    ]
  }
  if (/waste/.test(lower)) {
    return [
      'Reach the waste-type step',
      'Select a waste path',
      'Continue to skip selection',
      'Assert waste selection is retained',
    ]
  }
  if (/skip|size/.test(lower)) {
    return [
      'Reach the skip-size step',
      'Select an enabled skip size',
      'Continue to review',
      'Assert selected skip appears in summary',
    ]
  }
  if (/confirm|book|pricing|review/.test(lower)) {
    return [
      'Reach the review step with valid selections',
      'Verify price breakdown',
      'Confirm booking',
      'Assert confirmation / booking id is shown',
    ]
  }
  if (/\bapi\b/.test(lower)) {
    return ['Send the API request with a valid payload', 'Assert status + response contract']
  }
  return ['Navigate to target page', 'Perform primary action described by the AC', 'Assert expected outcome']
}

/**
 * Synthesize API-level designed cases from the scanned application routes.
 * These document the intended API coverage (the concrete spec is emitted by the
 * api-artifact-writer); they also surface in the coverage/quality report.
 */
function apiDesignedCases(state: StlcSharedState, startIndex: number): DesignedTestCase[] {
  const routes = state.appInsights?.apiRoutes ?? []
  const cases: DesignedTestCase[] = []
  let idx = startIndex

  for (const route of routes) {
    const label = `${route.method} ${route.routePath}`
    const required = route.fields.filter((f) => f.required)
    const has5xx = route.errorStatuses.some((s) => s >= 500)

    idx += 1
    cases.push({
      id: `TC-API-${idx}`,
      title: `${label} returns ${route.successStatus} for a valid request`,
      level: 'api',
      type: 'happy-path',
      priority: has5xx || required.length > 0 ? 'P0' : 'P1',
      acceptanceCriteriaIds: [],
      steps: [`Send a valid ${route.method} request to ${route.routePath}`, `Assert ${route.successStatus} and response contract`],
      status: 'draft',
      confidence: 0.9,
      reason: `Contract coverage for scanned route ${label}`,
    })

    for (const field of required) {
      idx += 1
      cases.push({
        id: `TC-API-${idx}`,
        title: `${label} rejects a request missing "${field.name}"`,
        level: 'api',
        type: 'negative',
        priority: 'P1',
        acceptanceCriteriaIds: [],
        steps: [`Send ${route.method} ${route.routePath} without "${field.name}"`, `Assert ${route.errorStatuses[0] ?? 400} validation error`],
        status: 'draft',
        confidence: 0.85,
        reason: `Validation coverage: "${field.name}" is required by the handler`,
      })
    }

    if (has5xx) {
      idx += 1
      cases.push({
        id: `TC-API-${idx}`,
        title: `${label} surfaces upstream ${route.errorStatuses.find((s) => s >= 500)} failures gracefully`,
        level: 'api',
        type: 'edge',
        priority: 'P1',
        acceptanceCriteriaIds: [],
        steps: [`Trigger the upstream failure path for ${route.routePath}`, 'Assert the server returns a controlled 5xx error body'],
        status: 'draft',
        confidence: 0.7,
        reason: 'Integration/error-state coverage (handler can return 5xx)',
      })
    }
  }

  return cases
}

/** One accessibility smoke case for the primary page (keyboard reachability). */
function accessibilityCase(domain: string, index: number, level: TestLevel): DesignedTestCase {
  return {
    id: `TC-A11Y-${index}`,
    title: `keyboard navigation reaches the primary controls on the ${domain} page`,
    level: level === 'api' ? 'ui' : level,
    type: 'edge',
    priority: 'P2',
    acceptanceCriteriaIds: [],
    steps: ['Load the page', 'Tab through interactive controls', 'Assert focus lands on inputs/buttons/links'],
    status: 'draft',
    confidence: 0.7,
    reason: 'Accessibility smoke: focusable controls',
  }
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
      const level = levelForCase(ac.text, defaultLevel)
      const happy: DesignedTestCase = {
        id: `${baseId}-HP`,
        title: `Verify ${ac.text}`,
        level,
        type: 'happy-path',
        priority:
          /must|confirm|book|lookup|p0|critical/i.test(ac.text) || level === 'api' ? 'P0' : 'P1',
        acceptanceCriteriaIds: [ac.id],
        steps: stepsForAc(ac.text),
        status: 'draft',
        confidence: 0.88,
        reason: `Mapped from ${ac.id} with AC-aware happy-path steps`,
      }
      designed.push(happy)

      if ((happy.priority === 'P0' || happy.priority === 'P1') && shouldAddNegativeVariants(ac.text)) {
        designed.push(...acAwareNegativeVariants(happy.title, ac.text, baseId, happy.level, ac.id))
      }
    }

    // Selector inventory → concrete UI cases (forms, actions, errors, success).
    const selectorCases = selectorDrivenCases(state.appInsights, options.codegen.domain, designed.length)
    designed.push(...selectorCases)

    // API-level coverage synthesized from the scanned application routes.
    const apiCases = apiDesignedCases(state, designed.length)
    designed.push(...apiCases)

    // One accessibility smoke case when the flow is UI-facing.
    if (designed.some((tc) => tc.level === 'ui') || (state.appInsights?.selectors.length ?? 0) > 0) {
      designed.push(accessibilityCase(options.codegen.domain, designed.length + 1, defaultLevel))
    }

    const uiCount = designed.filter((tc) => tc.level === 'ui').length
    designReason =
      `Heuristic design produced ${designed.length} cases ` +
      `(${uiCount} UI, ${apiCases.length} API, ${selectorCases.length} selector-driven) ` +
      'with AC-aware negative/boundary/a11y variants'
  }

  if (state.codebaseInsights) {
    const gaps = findingsMissingFromRequirements(
      state.codebaseInsights.findings,
      state.requirementText,
      designed.map((testCase) => testCase.title),
    ).filter((finding) =>
      isFindingRelevantToDomain(finding, options.codegen.domain, state.requirementText),
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
