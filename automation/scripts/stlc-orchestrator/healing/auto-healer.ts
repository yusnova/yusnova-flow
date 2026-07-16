import * as fs from 'node:fs'
import * as path from 'node:path'
import { isManualSpecLine, STLC_GENERATED_MARKER } from '@codegen-agent/planning/spec-merge'
import { CodebaseSelectorHint, scanCodebase } from '../../shared/codebase-scanner'
import { HealingProposal } from '../types'

export interface FailureContext {
  specPath: string
  specLine: number
  testTitle: string
  brokenSelector: string
  pomFile?: string
  pomProperty?: string
}

const SPEC_LINE = /(suites\/[^\s:]+\.spec\.ts):(\d+):(\d+)/i
const SELECTOR_IN_LOG = /\[data-test="([^"]+)"\]|\[data-testid="([^"]+)"\]|locator\('([^']+)'\)|locator\("([^"]+)"\)/i
const POM_PROPERTY = /inventoryPage\.([A-Za-z0-9_]+)/

export function parseFailureContexts(failureLog: string): FailureContext[] {
  const contexts: FailureContext[] = []
  const lines = failureLog.split('\n')

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    const specMatch = line.match(SPEC_LINE)
    if (!specMatch) continue

    const window = lines.slice(i, i + 12).join('\n')
    const selectorMatch = window.match(SELECTOR_IN_LOG)
    if (!selectorMatch) continue

    const brokenSelector =
      selectorMatch[0].startsWith('locator')
        ? selectorMatch[3] ?? selectorMatch[4] ?? selectorMatch[0]
        : selectorMatch[0]

    const pomMatch = window.match(POM_PROPERTY)
    contexts.push({
      specPath: specMatch[1]!,
      specLine: Number(specMatch[2]),
      testTitle: line.split('›').pop()?.trim() ?? 'unknown test',
      brokenSelector,
      ...(pomMatch ? { pomProperty: pomMatch[1] } : {}),
    })
  }

  return contexts
}

function suggestFromCodebase(
  brokenSelector: string,
  hints: CodebaseSelectorHint[],
): string | null {
  const dataTest = brokenSelector.match(/\[data-test="([^"]+)"\]/)?.[1]
  const dataTestId = brokenSelector.match(/\[data-testid="([^"]+)"\]/)?.[1]

  if (dataTest) {
    const exact = hints.find((hint) => hint.context === dataTest)
    if (exact) return exact.selector

    const partial = hints.find(
      (hint) => hint.context.includes(dataTest) || dataTest.includes(hint.context),
    )
    if (partial) return partial.selector
  }

  if (dataTestId) {
    const match = hints.find((hint) => hint.context === dataTestId)
    if (match) return match.selector
  }

  const frontendHint = hints.find((hint) => hint.source === 'frontend' && hint.strategy === 'data-test')
  return frontendHint?.selector ?? null
}

export function buildAutoHealProposals(
  failureLog: string,
  automationRoot: string,
  domain: string,
  pomPath?: string,
): HealingProposal[] {
  const repoRoot = path.resolve(automationRoot, '..')
  const insights = scanCodebase(repoRoot, domain)
  const contexts = parseFailureContexts(failureLog)
  const proposals: HealingProposal[] = []

  for (const context of contexts.slice(0, 5)) {
    const absSpec = path.join(automationRoot, context.specPath)
    if (!fs.existsSync(absSpec)) continue

    const specContent = fs.readFileSync(absSpec, 'utf-8')
    if (isManualSpecLine(specContent, context.specLine)) continue

    const line = specContent.split('\n')[context.specLine - 1] ?? ''
    if (!specContent.includes(STLC_GENERATED_MARKER) && !line.includes(STLC_GENERATED_MARKER)) {
      const window = specContent.split('\n').slice(Math.max(0, context.specLine - 6), context.specLine)
      if (!window.some((entry) => entry.includes(STLC_GENERATED_MARKER))) continue
    }

    const proposed = suggestFromCodebase(context.brokenSelector, insights.selectors)
    if (!proposed || proposed === context.brokenSelector) continue

    const resolvedPom = pomPath ?? path.join(automationRoot, 'pages', `${domain}-page.ts`)
    proposals.push({
      id: `HEAL-${Date.now()}-${proposals.length + 1}`,
      pomFile: resolvedPom,
      propertyOrMethod: context.pomProperty ?? 'unknownLocator',
      oldSelector: context.brokenSelector,
      proposedSelector: proposed,
      failureEvidence: context.testTitle,
      confidence: 0.7,
      status: 'pending_human',
      reason: `Codebase-informed selector fix from ${insights.scannedRoots.join(', ') || 'source scan'} — awaiting human approval (run "npm run healing:review")`,
      specPath: context.specPath,
      specLine: context.specLine,
      testTitle: context.testTitle,
      // NOTE: "autoApplicable" is a confidence/eligibility hint consumed ONLY by the
      // human-operated review CLI (healing/review-cli.ts). It must NEVER cause a
      // write to disk on its own — a human must explicitly run `npm run healing:review
      // -- --approve <id>` (or `--approve-all`) before any proposal reaches
      // status "approved" and gets applied. Do not call applyHealingProposals()
      // from pipeline agents.
      autoApplicable: true,
      createdAt: new Date().toISOString(),
    })
  }

  return proposals
}

export interface ApplyResult {
  applied: HealingProposal[]
  skipped: Array<{ proposal: HealingProposal; reason: string }>
}

/**
 * Writes an APPROVED healing proposal to disk (POM + generated spec lines only).
 *
 * Safety contract:
 * - Only proposals with `status === 'approved'` are written. This function is
 *   the single write path for self-healing and must only ever be invoked from
 *   `healing/review-cli.ts`, i.e. after an explicit human decision — never from
 *   an orchestrator phase/agent, never as a side effect of running Playwright.
 * - Manually authored spec lines (`@stlc:manual`) are always left untouched.
 */
export function applyHealingProposals(
  proposals: HealingProposal[],
  automationRoot: string,
): ApplyResult {
  const applied: HealingProposal[] = []
  const skipped: Array<{ proposal: HealingProposal; reason: string }> = []

  for (const proposal of proposals) {
    if (proposal.status !== 'approved') {
      skipped.push({ proposal, reason: `status is "${proposal.status}", not "approved" — run healing:review to approve first` })
      continue
    }
    if (!fs.existsSync(proposal.pomFile)) {
      skipped.push({ proposal, reason: `POM file not found: ${proposal.pomFile}` })
      continue
    }

    let pomContent = fs.readFileSync(proposal.pomFile, 'utf-8')
    if (!pomContent.includes(proposal.oldSelector)) {
      const escaped = proposal.oldSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const loose = new RegExp(escaped)
      if (!loose.test(pomContent)) {
        skipped.push({ proposal, reason: 'old selector no longer present in POM file (already changed?)' })
        continue
      }
    }

    pomContent = pomContent.replaceAll(proposal.oldSelector, proposal.proposedSelector)
    fs.writeFileSync(proposal.pomFile, pomContent, 'utf-8')

    if (proposal.specPath && proposal.specLine) {
      const specAbs = path.join(automationRoot, proposal.specPath)
      if (fs.existsSync(specAbs)) {
        const specContent = fs.readFileSync(specAbs, 'utf-8')
        if (!isManualSpecLine(specContent, proposal.specLine)) {
          const updatedSpec = specContent.replaceAll(proposal.oldSelector, proposal.proposedSelector)
          fs.writeFileSync(specAbs, updatedSpec, 'utf-8')
        }
      }
    }

    applied.push({
      ...proposal,
      status: 'applied',
      reason: `${proposal.reason} — human-approved and applied on ${new Date().toISOString()}`,
    })
  }

  return { applied, skipped }
}
