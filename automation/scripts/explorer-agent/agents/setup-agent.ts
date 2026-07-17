import { appendExploreAudit, nextExplorePhase } from '../state'
import { ExploreOrchestratorOptions, ExplorePhase, ExploreSharedState } from '../types'

export type ExploreAgentResult = {
  nextPhase: ExplorePhase
  state: ExploreSharedState
}

export async function runSetupAgent(
  state: ExploreSharedState,
  options: ExploreOrchestratorOptions,
): Promise<ExploreAgentResult> {
  let next = { ...state }

  try {
    const parsed = new URL(options.url)
    if (!parsed.protocol.startsWith('http')) {
      throw new Error('URL must be http(s)')
    }
  } catch {
    next = appendExploreAudit(next, {
      phase: 'setup',
      agent: 'setup-agent',
      action: 'blocked_invalid_url',
      reason: `Invalid URL: ${options.url}`,
      confidence: 1,
    })
    return { nextPhase: 'done', state: next }
  }

  next = appendExploreAudit(next, {
    phase: 'setup',
    agent: 'setup-agent',
    action: 'configured_exploration',
    reason:
      `Domain "${options.domain}" · budget ${options.maxPages} page(s) × ` +
      `${options.maxActionsPerPage} action(s) · headless=${options.headless} · ` +
      `sameOrigin=${options.sameOriginOnly} · ingestRag=${options.ingestRag}`,
    confidence: 1,
    inputs: {
      url: options.url,
      domain: options.domain,
      maxPages: options.maxPages,
      maxActionsPerPage: options.maxActionsPerPage,
    },
  })

  return { nextPhase: nextExplorePhase('setup', options.phases), state: next }
}
