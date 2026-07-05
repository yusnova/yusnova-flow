import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { createLlmClient } from '../llm/llm-client'
import {
  applyAutoHeals,
  buildAutoHealProposals,
} from '../healing/auto-healer'
import {
  isLocatorFailure,
  proposeSelectorHeal,
  proposeSelectorHealWithLlm,
} from '../healing/selector-healer'
import { DefectKnowledgeBase } from '../rag/defect-knowledge'
import { appendAudit } from '../state/pipeline-state'
import {
  AgentResult,
  DefectRecord,
  ExecutionResult,
  HealingProposal,
  HumanGate,
  OrchestratorOptions,
  StlcSharedState,
} from '../types'

function parsePlaywrightOutput(stdout: string, stderr: string): ExecutionResult[] {
  const combined = `${stdout}\n${stderr}`
  const results: ExecutionResult[] = []
  const passMatches = combined.matchAll(/✓\s+(.+?)(?:\s+\([\d.]+s\))?$/gm)
  for (const match of passMatches) {
    results.push({
      caseId: match[1]!.trim(),
      status: 'passed',
      flakyScore: 0,
    })
  }
  const failMatches = combined.matchAll(/✘\s+(.+?)(?:\s+\([\d.]+s\))?$/gm)
  for (const match of failMatches) {
    results.push({
      caseId: match[1]!.trim(),
      status: 'failed',
      evidence: 'See Playwright report for stack trace',
      flakyScore: 0.1,
    })
  }
  return results
}

async function buildHealingProposals(
  failureLog: string,
  state: StlcSharedState,
  options: OrchestratorOptions,
): Promise<HealingProposal[]> {
  if (options.enableSelfHealing === false) return []
  if (!isLocatorFailure(failureLog)) return []

  const automationRoot = path.resolve(__dirname, '..', '..', '..')
  const autoProposals = buildAutoHealProposals(
    failureLog,
    automationRoot,
    options.codegen.domain,
    state.codegenArtifacts?.pomPath,
  )

  if (autoProposals.length > 0) {
    const applied = applyAutoHeals(autoProposals, automationRoot)
    const pending = autoProposals.filter(
      (proposal) => !applied.some((entry) => entry.id === proposal.id),
    )
    return [...applied, ...pending]
  }

  const pomFile = state.codegenArtifacts?.pomPath ?? `pages/${options.codegen.domain}-page.ts`
  const llm = createLlmClient()
  const base = await proposeSelectorHeal(
    {
      pomFile,
      propertyOrMethod: 'unknownLocator',
      oldSelector: '[data-test="unknown"]',
      failureMessage: failureLog,
      pageUrl: options.codegen.url,
    },
    llm.isEnabled(),
  )

  if (!base) return []

  const proposal: HealingProposal = {
    ...base,
    autoApplicable: false,
    createdAt: new Date().toISOString(),
  }

  if (llm.isEnabled()) {
    proposal.proposedSelector = await proposeSelectorHealWithLlm(
      {
        pomFile,
        propertyOrMethod: proposal.propertyOrMethod,
        oldSelector: proposal.oldSelector,
        failureMessage: failureLog,
        pageUrl: options.codegen.url,
      },
      async (prompt) => {
        const response = await llm.complete({
          temperature: 0.1,
          messages: [{ role: 'user', content: prompt }],
        })
        return response.content
      },
    )
    proposal.confidence = 0.75
    proposal.reason = 'LLM proposed selector fix — awaiting human approval (never auto-applied)'
  }

  return [proposal]
}

export async function runExecutionAgent(
  state: StlcSharedState,
  options: OrchestratorOptions,
): Promise<AgentResult> {
  if (!options.runTests) {
    const skipped = appendAudit(
      { ...state, currentPhase: 'reporting' },
      {
        phase: 'execution',
        agent: 'execution-agent',
        action: 'skipped_execution',
        reason: 'Execution disabled (pass --run-tests to execute Playwright)',
        confidence: 1,
      },
    )
    return { nextPhase: 'reporting', state: skipped }
  }

  const automationRoot = path.resolve(__dirname, '..', '..', '..')
  const result = spawnSync(
    'npx',
    ['playwright', 'test', '--project=ui', `suites/${options.codegen.domain}`],
    {
      cwd: automationRoot,
      encoding: 'utf-8',
      env: { ...process.env, ENV: 'demo' },
    },
  )

  const failureLog = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const executionResults = parsePlaywrightOutput(result.stdout ?? '', result.stderr ?? '')
  const hasFailures = result.status !== 0 || executionResults.some((entry) => entry.status === 'failed')

  const healingProposals = hasFailures
    ? await buildHealingProposals(failureLog, state, options)
    : []

  const humanGates: HumanGate[] = [...state.humanGates]
  const pendingReview = healingProposals.filter((proposal) => proposal.status === 'pending_human')
  if (pendingReview.length > 0) {
    humanGates.push({
      phase: 'execution',
      status: 'pending',
      reason: `${pendingReview.length} self-healing proposal(s) require human approval before POM update`,
      requiredFor: pendingReview.map((proposal) => proposal.id),
    })
  }

  const appliedCount = healingProposals.filter((proposal) => proposal.status === 'applied').length

  const next = appendAudit(
    {
      ...state,
      executionResults,
      healingProposals: [...(state.healingProposals ?? []), ...healingProposals],
      humanGates,
      currentPhase: hasFailures ? 'triage' : 'reporting',
    },
    {
      phase: 'execution',
      agent: 'execution-agent',
      action: 'ran_playwright',
      reason: hasFailures
        ? appliedCount > 0
          ? `Execution failed; auto-healed ${appliedCount} generated test(s), ${pendingReview.length} proposal(s) pending review`
          : `Execution failed; ${healingProposals.length} healing proposal(s) queued for human review`
        : 'Execution passed',
      confidence: result.status === 0 ? 0.95 : 0.6,
    },
  )

  return { nextPhase: hasFailures ? 'triage' : 'reporting', state: next }
}

export async function runTriageAgent(
  state: StlcSharedState,
  options: OrchestratorOptions,
): Promise<AgentResult> {
  const failures = state.executionResults.filter((entry) => entry.status === 'failed')
  const defects: DefectRecord[] = failures.map((failure, index) => ({
    id: `DEF-${String(index + 1).padStart(3, '0')}`,
    title: failure.caseId,
    severity: failure.caseId.toLowerCase().includes('login') ? 'critical' : 'major',
    dedupHash: failure.caseId.toLowerCase().replace(/\s+/g, '-'),
    triageStatus: 'open',
    rootCauseHypothesis: 'Inspect latest commit diff and failure stack trace correlation',
    linkedCaseIds: [failure.caseId],
    confidence: 0.6,
  }))

  const deduped = new Map<string, DefectRecord>()
  for (const defect of defects) {
    const existing = deduped.get(defect.dedupHash)
    if (existing) {
      existing.linkedCaseIds.push(...defect.linkedCaseIds)
      existing.triageStatus = 'duplicate'
    } else {
      deduped.set(defect.dedupHash, defect)
    }
  }

  const allDefects = [...state.defects, ...deduped.values()]
  if (options.enableRag !== false && allDefects.length > 0) {
    const rag = new DefectKnowledgeBase()
    rag.ingestFromDefects([...deduped.values()], options.codegen.domain, state.runId)
  }

  const next = appendAudit(
    {
      ...state,
      defects: allDefects,
      currentPhase: 'reporting',
    },
    {
      phase: 'triage',
      agent: 'triage-agent',
      action: 'triaged_failures',
      reason: `Grouped ${failures.length} failure(s) into ${deduped.size} defect candidate(s); RAG knowledge updated`,
      confidence: 0.7,
    },
  )

  return { nextPhase: 'reporting', state: next }
}
