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
/** Matches any *Page.property (bookingFlowPage.lookupButtonBtn, inventoryPage.addBtn, …). */
const POM_PROPERTY = /([A-Za-z][A-Za-z0-9_]*)Page\.([A-Za-z0-9_]+)/g
const POM_ACTION_METHODS = new Set([
  'click',
  'fill',
  'check',
  'uncheck',
  'goto',
  'locator',
  'hover',
  'press',
  'selectOption',
  'type',
  'waitFor',
  'getByRole',
  'getByTestId',
  'getByText',
  'getByLabel',
])

function extractPomProperty(window: string): string | undefined {
  const matches = [...window.matchAll(POM_PROPERTY)]
  if (matches.length === 0) return undefined
  const locatorLike = [...matches]
    .reverse()
    .find((match) => !POM_ACTION_METHODS.has(match[2]!))
  return (locatorLike ?? matches[matches.length - 1])?.[2]
}

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

    const pomProperty = extractPomProperty(window)
    contexts.push({
      specPath: specMatch[1]!,
      specLine: Number(specMatch[2]),
      testTitle: line.split('›').pop()?.trim() ?? 'unknown test',
      brokenSelector,
      ...(pomProperty ? { pomProperty } : {}),
    })
  }

  return contexts
}

function preferHint(
  hints: CodebaseSelectorHint[],
  predicate: (hint: CodebaseSelectorHint) => boolean,
): CodebaseSelectorHint | undefined {
  return (
    hints.find((hint) => hint.source === 'frontend' && predicate(hint)) ??
    hints.find(predicate)
  )
}

/** lookupButtonBtn → ["lookup-button", "lookup"] */
function pomPropertyTestIdCandidates(property?: string): string[] {
  if (!property) return []
  const stripped = property.replace(/(Btn|Button|Input|Radio|Link|Checkbox|Select|Field)$/g, '')
  const kebab = stripped
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()
  const parts = kebab.split('-').filter(Boolean)
  const candidates: string[] = []
  if (kebab) candidates.push(kebab)
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    candidates.push(parts.slice(0, i).join('-'))
  }
  return [...new Set(candidates)]
}

const SECONDARY_TEST_ID = /(^|-)(error|loading|spinner|retry|disabled|hidden|skeleton)($|-)/i

function scorePartialHint(
  hint: CodebaseSelectorHint,
  attrValue: string,
  propertyCandidates: string[],
): number {
  let score = 0
  if (propertyCandidates.includes(hint.context)) score += 200
  if (hint.context.startsWith(`${attrValue}-`) || hint.context.startsWith(attrValue)) score += 80
  else if (hint.context.includes(attrValue)) score += 30
  if (hint.source === 'frontend') score += 20
  if (SECONDARY_TEST_ID.test(hint.context) && !SECONDARY_TEST_ID.test(attrValue)) score -= 100
  score -= Math.abs(hint.context.length - attrValue.length)
  return score
}

function suggestFromCodebase(
  brokenSelector: string,
  hints: CodebaseSelectorHint[],
  pomProperty?: string,
): string | null {
  const dataTest = brokenSelector.match(/\[data-test="([^"]+)"\]/)?.[1]
  const dataTestId = brokenSelector.match(/\[data-testid="([^"]+)"\]/)?.[1]
  const attrValue = dataTest ?? dataTestId
  const propertyCandidates = pomPropertyTestIdCandidates(pomProperty)

  if (attrValue) {
    for (const candidate of propertyCandidates) {
      const fromProperty = preferHint(hints, (hint) => hint.context === candidate)
      if (fromProperty && fromProperty.selector !== brokenSelector) return fromProperty.selector
    }

    const exact = preferHint(hints, (hint) => hint.context === attrValue)
    if (exact) return exact.selector

    // Prefer primary UI ids: "lookup" + lookupButtonBtn → "lookup-button", not "lookup-error".
    const partials = hints
      .filter(
        (hint) =>
          hint.context.startsWith(attrValue) ||
          hint.context.includes(attrValue) ||
          (attrValue.length >= 4 && attrValue.includes(hint.context)),
      )
      .sort(
        (a, b) =>
          scorePartialHint(b, attrValue, propertyCandidates) -
          scorePartialHint(a, attrValue, propertyCandidates),
      )
    const partial = partials[0]
    if (partial) return partial.selector

    return null
  }

  for (const candidate of propertyCandidates) {
    const fromProperty = preferHint(hints, (hint) => hint.context === candidate)
    if (fromProperty) return fromProperty.selector
  }

  const frontendHint = preferHint(
    hints,
    (hint) => hint.strategy === 'data-testid' || hint.strategy === 'data-test',
  )
  return frontendHint?.selector ?? null
}

/** POM sources often escape quotes: [data-testid=\"lookup\"]. */
function selectorForms(selector: string): string[] {
  const escapedQuotes = selector.replaceAll('"', '\\"')
  return [...new Set([selector, escapedQuotes])]
}

function contentIncludesSelector(content: string, selector: string): boolean {
  return selectorForms(selector).some((form) => content.includes(form))
}

function replaceSelectorInContent(content: string, from: string, to: string): string {
  let next = content
  for (const form of selectorForms(from)) {
    const replacement = form.includes('\\"') ? to.replaceAll('"', '\\"') : to
    next = next.replaceAll(form, replacement)
  }
  return next
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

    const proposed = suggestFromCodebase(
      context.brokenSelector,
      insights.selectors,
      context.pomProperty,
    )
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
    if (!contentIncludesSelector(pomContent, proposal.oldSelector)) {
      skipped.push({ proposal, reason: 'old selector no longer present in POM file (already changed?)' })
      continue
    }

    pomContent = replaceSelectorInContent(pomContent, proposal.oldSelector, proposal.proposedSelector)
    fs.writeFileSync(proposal.pomFile, pomContent, 'utf-8')

    if (proposal.specPath && proposal.specLine) {
      const specAbs = path.join(automationRoot, proposal.specPath)
      if (fs.existsSync(specAbs)) {
        const specContent = fs.readFileSync(specAbs, 'utf-8')
        if (!isManualSpecLine(specContent, proposal.specLine)) {
          const updatedSpec = replaceSelectorInContent(
            specContent,
            proposal.oldSelector,
            proposal.proposedSelector,
          )
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
