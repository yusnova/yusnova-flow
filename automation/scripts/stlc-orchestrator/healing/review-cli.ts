#!/usr/bin/env ts-node
/**
 * Human-in-the-loop review & apply CLI for self-healing proposals.
 *
 * This delegates to `proposal-actions.ts` — the single source of truth for
 * approve/reject logic, shared with the MCP server and dashboard. No
 * orchestrator phase/agent writes to POM or spec files on its own — a
 * proposal only moves from "pending_human" to "applied" when a human
 * explicitly approves it (via this CLI, the dashboard, or an MCP tool call).
 *
 * Usage:
 *   npm run healing:review -- --run <runId>                       # list pending proposals
 *   npm run healing:review -- --run <runId> --approve HEAL-123     # approve + apply one
 *   npm run healing:review -- --run <runId> --reject HEAL-123      # reject one
 *   npm run healing:review -- --run <runId> --approve-all --min-confidence 0.8
 *   npm run healing:review -- --list-runs                          # show runs with pending proposals
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Command } from 'commander'
import { approveAllProposals, approveProposal, rejectProposal } from './proposal-actions'
import { loadState, saveState } from '../state/pipeline-state'
import { fatalError, log, style } from '../terminal'
import { HealingProposal, StlcSharedState } from '../types'

const AUTOMATION_ROOT = path.resolve(__dirname, '..', '..', '..')
const DEFAULT_OUTPUT = path.join(AUTOMATION_ROOT, 'tmp/stlc')

function buildProgram(): Command {
  return new Command()
    .name('healing:review')
    .description('Review and apply self-healing selector proposals (human-in-the-loop only)')
    .option('--run <runId>', 'STLC run id (folder under tmp/stlc/)')
    .option('--list-runs', 'list all runs that have pending healing proposals', false)
    .option('--approve <id>', 'approve and immediately apply one proposal by id')
    .option('--reject <id>', 'reject one proposal by id (no files changed)')
    .option('--approve-all', 'approve + apply every pending proposal meeting --min-confidence', false)
    .option('--min-confidence <n>', 'minimum confidence for --approve-all', '0.75')
    .option('--reason <text>', 'optional note recorded with approve/reject decision')
    .option('--output-dir <path>', 'STLC state output directory', DEFAULT_OUTPUT)
}

function listRunsWithPending(outputDir: string): Array<{ runId: string; count: number }> {
  if (!fs.existsSync(outputDir)) return []
  const entries = fs.readdirSync(outputDir, { withFileTypes: true }).filter((e) => e.isDirectory())
  const results: Array<{ runId: string; count: number }> = []

  for (const entry of entries) {
    const statePath = path.join(outputDir, entry.name, 'state.json')
    if (!fs.existsSync(statePath)) continue
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as StlcSharedState
      const count = (state.healingProposals ?? []).filter((p) => p.status === 'pending_human').length
      if (count > 0) results.push({ runId: entry.name, count })
    } catch {
      continue
    }
  }

  return results
}

function printProposal(proposal: HealingProposal): void {
  const confidencePct = Math.round(proposal.confidence * 100)
  console.log(`
${style.bold(proposal.id)}  ${style.dim(`(confidence ${confidencePct}%)`)}
  POM file    : ${path.relative(AUTOMATION_ROOT, proposal.pomFile)}
  Property    : ${proposal.propertyOrMethod}
  Old selector: ${style.yellow(proposal.oldSelector)}
  Proposed    : ${style.green(proposal.proposedSelector)}
  Evidence    : ${proposal.failureEvidence.slice(0, 160)}
  Reason      : ${proposal.reason}${proposal.specPath ? `
  Spec        : ${proposal.specPath}:${proposal.specLine}` : ''}`)
}

async function main(): Promise<void> {
  const program = buildProgram()
  program.parse(process.argv)
  const opts = program.opts<{
    run?: string
    listRuns: boolean
    approve?: string
    reject?: string
    approveAll: boolean
    minConfidence: string
    reason?: string
    outputDir: string
  }>()

  const outputDir = path.resolve(opts.outputDir)

  if (opts.listRuns || !opts.run) {
    const runs = listRunsWithPending(outputDir)
    if (runs.length === 0) {
      log('info', 'No runs with pending self-healing proposals found.')
      return
    }
    log('step', 'Runs with pending self-healing proposals')
    for (const run of runs) {
      console.log(`  ${style.bold(run.runId)}  — ${run.count} pending`)
    }
    console.log(`\nRun: npm run healing:review -- --run <runId>`)
    return
  }

  const state = loadState(outputDir, opts.run)
  const proposals = state.healingProposals ?? []

  if (opts.approve) {
    const result = approveProposal(state, opts.approve, AUTOMATION_ROOT, opts.reason)
    if (result.outcome === 'not_found') fatalError(new Error(result.message))
    saveState(result.state, outputDir)
    if (result.outcome === 'applied') log('success', result.message)
    else log('warn', result.message)
    return
  }

  if (opts.reject) {
    const result = rejectProposal(state, opts.reject, opts.reason)
    if (result.outcome === 'not_found') fatalError(new Error(result.message))
    saveState(result.state, outputDir)
    if (result.outcome === 'rejected') log('success', result.message)
    else log('warn', result.message)
    return
  }

  if (opts.approveAll) {
    const minConfidence = Number(opts.minConfidence)
    const { state: nextState, results } = approveAllProposals(state, AUTOMATION_ROOT, minConfidence)

    if (results.length === 0) {
      log('info', `No pending proposals with confidence >= ${minConfidence}.`)
      return
    }

    for (const { proposalId, result } of results) {
      if (result.outcome === 'applied') log('success', `${proposalId}: ${result.message}`)
      else log('warn', `${proposalId}: ${result.message}`)
    }

    saveState(nextState, outputDir)
    const appliedCount = results.filter((entry) => entry.result.outcome === 'applied').length
    log('info', `${appliedCount}/${results.length} proposal(s) applied.`)
    return
  }

  // Default (no flags besides --run): list all proposals for this run.
  const pending = proposals.filter((p) => p.status === 'pending_human')
  const resolved = proposals.filter((p) => p.status !== 'pending_human')

  if (proposals.length === 0) {
    log('info', `No healing proposals recorded for run ${opts.run}.`)
    return
  }

  log('step', `Healing proposals — run ${opts.run}`)
  if (pending.length > 0) {
    console.log(style.bold(`\nPending human review (${pending.length}):`))
    for (const proposal of pending) printProposal(proposal)
    console.log(`
Approve one : npm run healing:review -- --run ${opts.run} --approve <id>
Reject one  : npm run healing:review -- --run ${opts.run} --reject <id>
Approve all : npm run healing:review -- --run ${opts.run} --approve-all --min-confidence 0.8`)
  }
  if (resolved.length > 0) {
    console.log(style.dim(`\nAlready resolved (${resolved.length}):`))
    for (const proposal of resolved) {
      console.log(style.dim(`  ${proposal.id}: ${proposal.status} — ${proposal.oldSelector} → ${proposal.proposedSelector}`))
    }
  }
}

main().catch(fatalError)
