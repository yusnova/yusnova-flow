import { HealingProposal } from '../types'

export type { HealingProposal }

export interface HealingInput {
  pomFile: string
  propertyOrMethod: string
  oldSelector: string
  failureMessage: string
  pageUrl?: string
}

const LOCATOR_FAILURE = /locator|timeout|strict mode|not found|waiting for selector/i

export function isLocatorFailure(message: string): boolean {
  return LOCATOR_FAILURE.test(message)
}

export async function proposeSelectorHeal(
  input: HealingInput,
  llmEnabled: boolean,
): Promise<HealingProposal | null> {
  if (!isLocatorFailure(input.failureMessage)) return null

  const proposedSelector = llmEnabled
    ? suggestWithLlmPlaceholder(input)
    : suggestHeuristic(input)

  return {
    id: `HEAL-${Date.now()}`,
    pomFile: input.pomFile,
    propertyOrMethod: input.propertyOrMethod,
    oldSelector: input.oldSelector,
    proposedSelector,
    failureEvidence: input.failureMessage.slice(0, 500),
    confidence: llmEnabled ? 0.72 : 0.55,
    status: 'pending_human',
    reason: 'Selector failure detected — human approval required before applying heal',
    autoApplicable: false,
    createdAt: new Date().toISOString(),
  }
}

function suggestHeuristic(input: HealingInput): string {
  const dataTest = input.oldSelector.match(/\[data-test="([^"]+)"\]/)?.[1]
  if (dataTest) return `[data-test="${dataTest}"]`

  const id = input.oldSelector.match(/#([a-zA-Z0-9_-]+)/)?.[1]
  if (id) return `#${id}`

  return input.oldSelector
}

function suggestWithLlmPlaceholder(input: HealingInput): string {
  // LLM suggestion is filled by execution-agent when STLC_LLM_API_KEY is set.
  // Keep deterministic fallback to avoid silent auto-heal.
  return suggestHeuristic(input)
}

export async function proposeSelectorHealWithLlm(
  input: HealingInput,
  complete: (prompt: string) => Promise<string>,
): Promise<string> {
  const prompt = [
    'You are a Playwright locator repair assistant.',
    'Return ONLY a single CSS/data-test selector string. No explanation.',
    `Page URL: ${input.pageUrl ?? 'unknown'}`,
    `Broken selector: ${input.oldSelector}`,
    `POM member: ${input.propertyOrMethod}`,
    `Failure: ${input.failureMessage.slice(0, 400)}`,
  ].join('\n')

  const raw = await complete(prompt)
  const selector = raw.trim().replace(/^['"]|['"]$/g, '')
  return selector || suggestHeuristic(input)
}
