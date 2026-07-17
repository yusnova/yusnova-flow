import * as path from 'node:path'
import { PageAnalyser } from '@codegen-agent/dom/page-analyser'
import { ElementInfo, ElementMap } from '../codegen-agent/types'
import { CodebaseFinding, CodebaseInsights, scanCodebase } from '../shared/codebase-scanner'
import { resolveAppUnderTestRoot, scanAppUnderTest } from '../shared/app-scanner'
import { criteriaFromAppSelectors } from './design/heuristic-enrichment'
import { parseAcceptanceCriteria } from './requirements/ac-parser'

export const DEMO_REQUIREMENT_SNIPPETS = [
  'user can view the product list',
  'user must be able to add items to cart',
  'user can sort products by price',
] as const

export interface SynthesizeRequirementsOptions {
  url: string
  domain: string
  headless?: boolean
  repoRoot: string
  appRoot?: string
}

export interface SynthesizedRequirements {
  text: string
  sources: Array<'page' | 'url' | 'codebase' | 'app'>
  acceptanceCriteria: string[]
}

export function shouldAutoSynthesizeRequirements(
  requirementText: string,
  requirementFile?: string,
): boolean {
  if (requirementFile?.trim()) return false
  const trimmed = requirementText.trim()
  if (trimmed.length === 0) return true
  return isDemoRequirementText(trimmed)
}

/**
 * Enrich even when the caller passed some prose — if structured ACs are thin,
 * merge live page + codebase + app-scan criteria so no-LLM design still has meat.
 */
export function shouldEnrichRequirements(
  requirementText: string,
  requirementFile?: string,
): boolean {
  if (shouldAutoSynthesizeRequirements(requirementText, requirementFile)) return true
  return parseAcceptanceCriteria(requirementText).length < 4
}

export function isDemoRequirementText(text: string): boolean {
  const lower = text.toLowerCase()
  return DEMO_REQUIREMENT_SNIPPETS.every((snippet) => lower.includes(snippet))
}

export async function synthesizeRequirements(
  opts: SynthesizeRequirementsOptions,
): Promise<SynthesizedRequirements> {
  const sources: SynthesizedRequirements['sources'] = []
  const criteria: string[] = []

  try {
    const analyser = new PageAnalyser()
    const pageMap = await analyser.analyse(opts.url, opts.headless ?? true)
    criteria.push(...inferCriteriaFromPage(pageMap, opts.domain))
    sources.push('page')
  } catch {
    criteria.push(...inferCriteriaFromUrl(opts.url, opts.domain))
    sources.push('url')
  }

  const insights = scanCodebase(opts.repoRoot, opts.domain)
  if (insights.scannedRoots.length > 0) {
    criteria.push(...inferCriteriaFromCodebase(insights, opts.domain, criteria))
    sources.push('codebase')
  }

  const appRoot = opts.appRoot ?? resolveAppUnderTestRoot({
    domain: opts.domain,
    searchFrom: [opts.repoRoot, path.resolve(opts.repoRoot, '..'), process.cwd()],
  })
  if (appRoot) {
    const app = scanAppUnderTest(appRoot)
    if (app.detected) {
      criteria.push(...criteriaFromAppSelectors(app, opts.domain))
      sources.push('app')
    }
  }

  const acceptanceCriteria = dedupeCriteria(criteria)
  const text = acceptanceCriteria.map((line) => (line.startsWith('AC:') ? line : `AC: ${line}`)).join('\n')

  return { text, sources, acceptanceCriteria }
}

/** Merge caller-provided ACs with synthesized ones (caller wins on duplicates). */
export function mergeRequirementTexts(existing: string, synthesized: SynthesizedRequirements): string {
  const fromCaller = parseAcceptanceCriteria(existing).map((ac) => ac.text)
  const merged = dedupeCriteria([...fromCaller, ...synthesized.acceptanceCriteria])
  return merged.map((line) => (line.startsWith('AC:') ? line : `AC: ${line}`)).join('\n')
}

function elementBlob(el: ElementInfo): string {
  return [
    el.dataTest,
    el.dataTestId,
    el.id,
    el.name,
    el.placeholder,
    el.ariaLabel,
    el.accessibleName,
    el.textContent,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function inferCriteriaFromPage(map: ElementMap, domain: string): string[] {
  const criteria: string[] = []
  const pathname = safePathname(map.url)
  const links = collectLinkLabels(map.elements)
  const blobs = map.elements.map(elementBlob)
  const has = (re: RegExp) => blobs.some((b) => re.test(b))

  const hasInventory = map.elements.some(
    (el) =>
      el.dataTest?.includes('inventory') === true
      || el.dataTest?.startsWith('add-to-cart') === true
      || el.dataTest === 'product-sort-container',
  )
  const hasFormFields = map.elements.some(
    (el) => el.kind.startsWith('input-') || el.kind === 'textarea' || el.kind === 'select',
  )
  const hasLanguageControl = map.elements.some(
    (el) =>
      el.id === 'langDropBtn'
      || el.id?.startsWith('lang-') === true
      || /language|dil/i.test(`${el.ariaLabel ?? ''} ${el.textContent ?? ''}`),
  )
  const articleLikeLinks = links.filter((label) => label.length >= 35)
  const isBlogContext = pathname.includes('blog') || articleLikeLinks.length >= 3

  // Multi-step booking / wizard funnel signals (data-testid + labels).
  const isWizardFunnel =
    (has(/postcode|postal/) && has(/look\s*up|lookup/))
    || (has(/waste/) && has(/skip/))
    || (has(/next-from-step|step-dot|step-indicator/) && has(/confirm|book/))

  criteria.push(`User can open the ${humanizeDomain(domain)} page`)
  if (map.pageTitle.trim()) {
    criteria.push(`Page shows the "${map.pageTitle.trim()}" title`)
  }

  if (isWizardFunnel || has(/booking-flow|step-postcode/)) {
    if (has(/postcode|postal/)) {
      criteria.push('User can enter a UK postcode and look up matching addresses')
    }
    if (has(/manual-address|empty-address/)) {
      criteria.push('User can enter an address manually when lookup returns no results')
    }
    if (has(/lookup-error|retry-lookup|invalid/)) {
      criteria.push('User sees a clear validation error for empty or invalid postcode lookup')
    }
    if (has(/waste/)) {
      criteria.push('User can select a waste type before choosing a skip')
    }
    if (has(/skip|yard/)) {
      criteria.push('User can select an available skip size based on waste rules')
    }
    if (has(/confirm|review|price/)) {
      criteria.push('User can review pricing and confirm the booking')
    }
    if (has(/booking-success|booking-id|start-again/)) {
      criteria.push('User sees a booking confirmation with a reference id after success')
    }
    criteria.push(`User can complete the ${humanizeDomain(domain)} multi-step funnel end-to-end`)
  }

  if (isBlogContext) {
    criteria.push('User can view the blog listing page')
    criteria.push('User can open a blog article from the listing')
    criteria.push('User can return to the blog index from an article')
  }

  if (hasLanguageControl) {
    criteria.push('User can change the site language from the language selector')
  }

  if (links.length >= 4) {
    criteria.push('User can navigate using primary header links')
  }

  if (links.some((label) => /teklif|iletişim|contact|quote/i.test(label))) {
    criteria.push('User can reach the contact or quote call-to-action from the page')
  }

  if (hasFormFields && !isBlogContext && !isWizardFunnel) {
    criteria.push('User can complete and submit the main form on the page')
  }

  if (hasInventory) {
    criteria.push('User can view the product list')
    criteria.push('User must be able to add items to cart')
    if (map.elements.some((el) => el.dataTest === 'product-sort-container' || el.kind === 'select')) {
      criteria.push('User can sort products from the catalog controls')
    }
  }

  return criteria
}

export function inferCriteriaFromUrl(url: string, domain: string): string[] {
  const pathname = safePathname(url)
  const criteria = [`User can open the ${humanizeDomain(domain)} page`]

  if (pathname.includes('blog')) {
    criteria.push('User can view the blog listing page')
    criteria.push('User can open a blog article from the listing')
  } else if (pathname.includes('contact') || pathname.includes('iletisim')) {
    criteria.push('User can view the contact page')
    criteria.push('User can submit the contact form')
  } else {
    criteria.push(`User can view primary content on the ${humanizeDomain(domain)} page`)
  }

  return criteria
}

function inferCriteriaFromCodebase(
  insights: CodebaseInsights,
  domain: string,
  existing: string[],
): string[] {
  const criteria: string[] = []
  const existingLower = existing.join('\n').toLowerCase()
  const domainLower = domain.toLowerCase()

  for (const finding of insights.findings) {
    if (finding.category === 'selector' || finding.category === 'gap' || finding.category === 'unstable') continue
    if (/selector hint/i.test(finding.summary)) continue
    if (!isFindingRelevantToDomain(finding, domain, existingLower)) continue
    const ac = findingToCriterion(finding, domain)
    if (!existingLower.includes(ac.toLowerCase())) {
      criteria.push(ac)
    }
  }

  for (const endpoint of insights.apiEndpoints.slice(0, 3)) {
    const ac = `API responds successfully for ${endpoint}`
    if (!existingLower.includes(endpoint.toLowerCase()) && endpoint.toLowerCase().includes(domainLower)) {
      criteria.push(ac)
    }
  }

  return criteria.slice(0, 8)
}

export function isFindingRelevantToDomain(
  finding: CodebaseFinding,
  domain: string,
  requirementText: string,
): boolean {
  const req = requirementText.toLowerCase()
  const domainLower = domain.toLowerCase()
  const file = finding.filePath.toLowerCase()
  const title = finding.suggestedTestTitle.toLowerCase()

  if (file.includes(`suites/${domainLower}/`) || file.includes(`domains/${domainLower}/`)) {
    return true
  }

  if (file.includes(domainLower) && (file.includes('frontend/') || file.includes('backend/'))) {
    return true
  }

  if (/product catalog|inventory|add items|sort products/.test(title) && !/product|cart|inventory/.test(req)) {
    return false
  }

  if (/authentication workflow/.test(title) && domainLower !== 'auth' && !/auth|login|session/.test(req)) {
    return false
  }

  if (/registration workflow/.test(title) && !/register|sign[\s-]?up/.test(req)) {
    return false
  }

  if (/checkout|cart workflow/.test(title) && !/cart|checkout|product/.test(req)) {
    return false
  }

  if (finding.source === 'automation' && !file.includes(domainLower)) {
    return false
  }

  return finding.severity !== 'low'
}

function findingToCriterion(finding: CodebaseFinding, domain: string): string {
  const summary = finding.summary.replace(/^Critical business workflow detected:\s*/i, '')
  if (finding.category === 'integration' && finding.suggestedLevel === 'api') {
    return `API integration for ${domain} is available and responds as expected`
  }
  if (finding.category === 'unstable') {
    return `User can use ${humanizeDomain(domain)} without hitting unstable UI behaviour`
  }
  return `User can complete the ${summary} on ${humanizeDomain(domain)}`
}

function collectLinkLabels(elements: ElementInfo[]): string[] {
  const labels = elements
    .filter((el) => el.kind === 'link')
    .map((el) => (el.accessibleName ?? el.textContent ?? '').trim().replace(/\s+/g, ' '))
    .filter((label) => label.length > 0)

  return [...new Set(labels)]
}

function dedupeCriteria(criteria: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const line of criteria) {
    const key = line.toLowerCase().replace(/^ac:\s*/, '').trim()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(line.replace(/^AC:\s*/i, '').trim())
  }

  return result
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function humanizeDomain(domain: string): string {
  return domain
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
