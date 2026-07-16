import { applyHealingProposals } from './auto-healer'
import { AuditEntry, HealingProposal, StlcSharedState } from '../types'

export type ProposalActionOutcome = 'applied' | 'skipped' | 'rejected' | 'not_found' | 'already_resolved'

export interface ProposalActionResult {
  state: StlcSharedState
  outcome: ProposalActionOutcome
  message: string
}

/**
 * Shared approve/reject logic used by BOTH the human review CLI
 * (`healing/review-cli.ts`) and the MCP server / dashboard. This is the
 * single source of truth for "what happens when a human approves a healing
 * proposal" — keeping it in one place means every surface (CLI, chat, web UI)
 * enforces the exact same safety contract (only `approved` proposals get
 * written, manual spec lines are never touched, every decision is audited).
 */
export function approveProposal(
  state: StlcSharedState,
  proposalId: string,
  automationRoot: string,
  reasonNote?: string,
): ProposalActionResult {
  const proposals = state.healingProposals ?? []
  const target = proposals.find((proposal) => proposal.id === proposalId)

  if (!target) {
    return { state, outcome: 'not_found', message: `Proposal ${proposalId} not found in this run` }
  }
  if (target.status !== 'pending_human') {
    return {
      state,
      outcome: 'already_resolved',
      message: `Proposal ${proposalId} is already "${target.status}" — nothing to do`,
    }
  }

  const approved: HealingProposal = { ...target, status: 'approved' }
  const { applied, skipped } = applyHealingProposals([approved], automationRoot)

  const updatedProposals = proposals.map((proposal) => applied.find((entry) => entry.id === proposal.id) ?? proposal)

  const auditEntry: Omit<AuditEntry, 'timestamp'> = {
    phase: 'execution',
    agent: 'healing-review-cli',
    action: applied.length > 0 ? 'human_applied_healing_proposal' : 'human_approved_healing_proposal',
    reason: reasonNote
      ? `${proposalId}: ${reasonNote}`
      : `${proposalId}: ${target.oldSelector} → ${target.proposedSelector}`,
    confidence: 1,
  }

  const nextState: StlcSharedState = {
    ...state,
    healingProposals: updatedProposals,
    auditTrail: [...state.auditTrail, { ...auditEntry, timestamp: new Date().toISOString() }],
  }

  if (applied.length > 0) {
    return {
      state: nextState,
      outcome: 'applied',
      message: `Applied ${proposalId}: ${target.oldSelector} → ${target.proposedSelector}`,
    }
  }

  return {
    state: nextState,
    outcome: 'skipped',
    message: skipped[0]?.reason ?? 'Approved but could not be applied (see logs)',
  }
}

export function rejectProposal(
  state: StlcSharedState,
  proposalId: string,
  reasonNote?: string,
): ProposalActionResult {
  const proposals = state.healingProposals ?? []
  const target = proposals.find((proposal) => proposal.id === proposalId)

  if (!target) {
    return { state, outcome: 'not_found', message: `Proposal ${proposalId} not found in this run` }
  }
  if (target.status !== 'pending_human') {
    return {
      state,
      outcome: 'already_resolved',
      message: `Proposal ${proposalId} is already "${target.status}" — nothing to do`,
    }
  }

  const rejectionReason = reasonNote ? `${target.reason} — rejected by human review: ${reasonNote}` : `${target.reason} — rejected by human review`
  const updatedProposals = proposals.map((proposal) =>
    proposal.id === target.id ? { ...proposal, status: 'rejected' as const, reason: rejectionReason } : proposal,
  )

  const auditEntry: Omit<AuditEntry, 'timestamp'> = {
    phase: 'execution',
    agent: 'healing-review-cli',
    action: 'human_rejected_healing_proposal',
    reason: reasonNote ? `${proposalId}: ${reasonNote}` : `${proposalId}: rejected`,
    confidence: 1,
  }

  const nextState: StlcSharedState = {
    ...state,
    healingProposals: updatedProposals,
    auditTrail: [...state.auditTrail, { ...auditEntry, timestamp: new Date().toISOString() }],
  }

  return { state: nextState, outcome: 'rejected', message: `Rejected ${proposalId}. No files were changed.` }
}

export function approveAllProposals(
  state: StlcSharedState,
  automationRoot: string,
  minConfidence: number,
): { state: StlcSharedState; results: Array<{ proposalId: string; result: ProposalActionResult }> } {
  const proposals = state.healingProposals ?? []
  const eligible = proposals.filter((proposal) => proposal.status === 'pending_human' && proposal.confidence >= minConfidence)

  let currentState = state
  const results: Array<{ proposalId: string; result: ProposalActionResult }> = []

  for (const proposal of eligible) {
    const result = approveProposal(currentState, proposal.id, automationRoot)
    currentState = result.state
    results.push({ proposalId: proposal.id, result })
  }

  return { state: currentState, results }
}
