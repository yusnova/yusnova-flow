import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { approveAllProposals, approveProposal, rejectProposal } from './proposal-actions'
import { HealingProposal, StlcSharedState } from '../types'

function baseState(proposals: HealingProposal[]): StlcSharedState {
  return {
    runId: 'test-run',
    requirementText: '',
    ambiguityFlags: [],
    testabilityScore: 0,
    acceptanceCriteria: [],
    testScope: { inScope: [], outOfScope: [], riskMatrix: [] },
    testCases: [],
    executionResults: [],
    defects: [],
    humanGates: [],
    qualityGate: { decision: 'pending', blockingReasons: [], coveragePercent: 0, openP0Count: 0, recommendation: '', confidence: 0 },
    auditTrail: [],
    healingProposals: proposals,
    currentPhase: 'done',
  }
}

function makeProposal(id: string, pomFile: string, overrides: Partial<HealingProposal> = {}): HealingProposal {
  return {
    id,
    pomFile,
    propertyOrMethod: 'someButton',
    oldSelector: '[data-test="old"]',
    proposedSelector: '[data-test="new"]',
    failureEvidence: 'timeout',
    confidence: 0.8,
    status: 'pending_human',
    reason: 'fixture',
    autoApplicable: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-proposal-actions-'))

try {
  // --- approveProposal: not found ---
  {
    const state = baseState([])
    const result = approveProposal(state, 'MISSING', dir)
    assert.equal(result.outcome, 'not_found')
  }

  // --- approveProposal: applies and writes file ---
  {
    const pomFile = path.join(dir, 'page-a.ts')
    fs.writeFileSync(pomFile, `readonly someButton = page.locator('[data-test="old"]')`)
    const state = baseState([makeProposal('HEAL-1', pomFile)])

    const result = approveProposal(state, 'HEAL-1', dir)
    assert.equal(result.outcome, 'applied')
    assert.equal(fs.readFileSync(pomFile, 'utf-8').includes('[data-test="new"]'), true)
    assert.equal(result.state.healingProposals![0]!.status, 'applied')
    assert.equal(result.state.auditTrail.length, 1)
    assert.equal(result.state.auditTrail[0]!.agent, 'healing-review-cli')
  }

  // --- approveProposal: already resolved is idempotent ---
  {
    const pomFile = path.join(dir, 'page-b.ts')
    fs.writeFileSync(pomFile, `readonly someButton = page.locator('[data-test="old"]')`)
    const state = baseState([makeProposal('HEAL-2', pomFile, { status: 'applied' })])
    const result = approveProposal(state, 'HEAL-2', dir)
    assert.equal(result.outcome, 'already_resolved')
  }

  // --- rejectProposal: marks rejected, never touches files ---
  {
    const pomFile = path.join(dir, 'page-c.ts')
    const original = `readonly someButton = page.locator('[data-test="old"]')`
    fs.writeFileSync(pomFile, original)
    const state = baseState([makeProposal('HEAL-3', pomFile)])

    const result = rejectProposal(state, 'HEAL-3', 'not a real fix')
    assert.equal(result.outcome, 'rejected')
    assert.equal(fs.readFileSync(pomFile, 'utf-8'), original, 'file must be untouched on rejection')
    assert.equal(result.state.healingProposals![0]!.status, 'rejected')
  }

  // --- approveAllProposals: respects min-confidence threshold ---
  {
    const pomFileHigh = path.join(dir, 'page-d.ts')
    const pomFileLow = path.join(dir, 'page-e.ts')
    fs.writeFileSync(pomFileHigh, `readonly someButton = page.locator('[data-test="old"]')`)
    fs.writeFileSync(pomFileLow, `readonly someButton = page.locator('[data-test="old"]')`)

    const state = baseState([
      makeProposal('HEAL-HIGH', pomFileHigh, { confidence: 0.9 }),
      makeProposal('HEAL-LOW', pomFileLow, { confidence: 0.5 }),
    ])

    const { state: nextState, results } = approveAllProposals(state, dir, 0.75)
    assert.equal(results.length, 1, 'only the high-confidence proposal should be processed')
    assert.equal(results[0]!.proposalId, 'HEAL-HIGH')
    assert.equal(results[0]!.result.outcome, 'applied')

    const lowProposal = nextState.healingProposals!.find((p) => p.id === 'HEAL-LOW')!
    assert.equal(lowProposal.status, 'pending_human', 'low-confidence proposal must remain untouched')
  }

  console.log('proposal-actions.test.ts: all assertions passed')
} finally {
  fs.rmSync(dir, { recursive: true, force: true })
}
