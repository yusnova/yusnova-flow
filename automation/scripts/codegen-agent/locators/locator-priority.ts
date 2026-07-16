import { ElementInfo, LocatorConfidence, LocatorResult, LocatorStrategyName } from '../types'

/** Test-only attributes — highest stability (intentionally kept for automation). */
export const TEST_ATTRIBUTE_NAMES = [
  'data-testid',
  'data-test-id',
  'data-test',
  'data-cy',
  'data-qa',
] as const

export type TestAttributeName = (typeof TEST_ATTRIBUTE_NAMES)[number]

const GENERATED_CLASS_PATTERN = /^(css-|sc-|chakra-|mui-|emotion-|_[a-z]|[a-z]+-[a-f0-9]{5,})/i

const DYNAMIC_ID_PATTERNS: RegExp[] = [
  /^:r\d+:?$/,
  /^mui-\d+$/i,
  /^react-select-\d+-/i,
  /^headlessui-/i,
  /^radix-/i,
  /^[a-z]+-\d{3,}$/i,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  /\d{6,}/,
  /^[a-f0-9]{8,}$/i,
  /-\d{5,}(?:-\d+)*$/,
]

const STABLE_ID_PATTERN = /^[a-z][a-z0-9_-]{1,48}$/i

export function escapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function isDynamicId(id: string): boolean {
  const trimmed = id.trim()
  if (!trimmed) return true
  if (trimmed.length > 64) return true
  return DYNAMIC_ID_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export function isStableId(id: string): boolean {
  const trimmed = id.trim()
  if (!trimmed || isDynamicId(trimmed)) return false
  return STABLE_ID_PATTERN.test(trimmed)
}

export function isGeneratedClass(className: string): boolean {
  return GENERATED_CLASS_PATTERN.test(className)
}

export function pickTestAttribute(el: ElementInfo): { attr: TestAttributeName; value: string } | null {
  const pairs: Array<[TestAttributeName, string | undefined]> = [
    ['data-testid', el.dataTestId],
    ['data-test-id', el.dataTestIdHyphen],
    ['data-test', el.dataTest],
    ['data-cy', el.dataCy],
    ['data-qa', el.dataQa],
  ]

  for (const [attr, raw] of pairs) {
    const value = raw?.trim()
    if (value) return { attr, value }
  }
  return null
}

function confidenceForStrategy(strategy: LocatorStrategyName): LocatorConfidence {
  switch (strategy) {
    case 'data-testid':
    case 'data-test-id':
    case 'data-test':
    case 'data-cy':
    case 'data-qa':
      return 'high'
    case 'role':
      return 'high'
    case 'id':
      return 'medium'
    case 'name':
    case 'aria-label':
      return 'medium'
    case 'placeholder':
    case 'text':
    case 'class-contains':
      return 'medium'
    case 'css-path':
      return 'low'
    case 'nth':
      return 'low'
    default:
      return 'low'
  }
}

function result(strategy: LocatorStrategyName, selector: string): LocatorResult {
  return { strategy, selector, confidence: confidenceForStrategy(strategy) }
}

export function pickRoleLocator(el: ElementInfo): LocatorResult | null {
  const role = el.role?.trim()
  const name = el.accessibleName?.trim()
  if (!role || !name) return null
  if (name.length > 80) return null

  const safeName = escapeAttr(name)
  return result('role', `role=${role}[name="${safeName}"]`)
}

export function pickElementLocator(el: ElementInfo): LocatorResult {
  const testAttr = pickTestAttribute(el)
  if (testAttr) {
    const strategy = testAttr.attr as LocatorStrategyName
    return result(strategy, `[${testAttr.attr}="${escapeAttr(testAttr.value)}"]`)
  }

  if (el.id && isStableId(el.id)) {
    return result('id', `#${cssEscapeId(el.id)}`)
  }

  const roleLocator = pickRoleLocator(el)
  if (roleLocator) return roleLocator

  if (el.name?.trim()) {
    const tag = el.tagName
    return result('name', `${tag}[name="${escapeAttr(el.name.trim())}"]`)
  }

  if (el.ariaLabel?.trim()) {
    return result('aria-label', `[aria-label="${escapeAttr(el.ariaLabel.trim())}"]`)
  }

  if (el.placeholder?.trim()) {
    return result('placeholder', `[placeholder="${escapeAttr(el.placeholder.trim())}"]`)
  }

  const textLocator = pickTextLocator(el)
  if (textLocator) return textLocator

  const relative = buildRelativeCssPath(el)
  if (relative) return relative

  const classLocator = pickClassContainsLocator(el)
  if (classLocator) return classLocator

  return result('nth', `${el.tagName}:nth-of-type(${Math.max(1, (el.index % 5) + 1)})`)
}

function pickTextLocator(el: ElementInfo): LocatorResult | null {
  const text = el.textContent?.trim()
  if (!text || text.length > 60) return null

  const safe = escapeAttr(text.slice(0, 40))
  if (el.kind === 'button' || el.tagName === 'button' || el.role === 'button') {
    return result('text', `button:has-text("${safe}")`)
  }
  if (el.kind === 'link' || el.tagName === 'a') {
    return result('text', `a:has-text("${safe}")`)
  }
  if (el.kind === 'input-text' || el.kind === 'input-email' || el.kind === 'input-password') {
    if (el.type === 'submit' || el.type === 'button') {
      return result('text', `input[type="${escapeAttr(el.type)}"][value="${safe}"]`)
    }
  }
  return null
}

/** Picks a stable substring token from class names for [class*="…"] selectors. */
export function pickSemanticClassToken(classes: string[]): string | null {
  const stable = classes.filter((cls) => !isGeneratedClass(cls) && cls.length >= 3)
  if (stable.length === 0) return null

  const ranked = stable
    .map((cls) => {
      const segments = cls.split(/[_-]/).filter((part) => part.length >= 4 && !/^\d+$/.test(part))
      const token = segments.length > 0 ? segments.join('-') : cls
      let score = (cls.includes('-') || cls.includes('_') ? 10 : 0) + token.length
      if (/^(form-control|btn|container|wrapper|row|col)$/i.test(token)) score -= 8
      return { token, score }
    })
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (!best || /\d{5,}/.test(best.token)) return null
  return best.token
}

export function pickClassContainsLocator(el: ElementInfo): LocatorResult | null {
  const token = pickSemanticClassToken(el.classes)
  if (!token) return null

  const tag = el.tagName
  const typeAttr = el.type ? `[type="${escapeAttr(el.type)}"]` : ''
  return result('class-contains', `${tag}${typeAttr}[class*="${escapeAttr(token)}"]`)
}

function buildRelativeCssPath(el: ElementInfo): LocatorResult | null {
  let elFrag = buildElementFragment(el)
  if (!elFrag) return null

  const stableAncestors = el.ancestorSelectors
    .map((ancestor) => sanitizeAncestorSelector(ancestor))
    .filter(Boolean) as string[]

  const anchor = stableAncestors.find((ancestor) => isHighStabilityAncestor(ancestor))
  const parent = stableAncestors.length > 0 ? stableAncestors[stableAncestors.length - 1] : undefined

  const parts = [anchor ?? parent, elFrag].filter(Boolean)
  if (parts.length === 0) return null

  const selector = parts.join(' ')
  if (parts.length === 1 && elFrag.includes('[class*=')) {
    return result('class-contains', selector)
  }

  return result('css-path', selector)
}

function buildElementFragment(el: ElementInfo): string | null {
  const tag = el.tagName
  const typeAttr = el.type ? `[type="${escapeAttr(el.type)}"]` : ''

  const classToken = pickSemanticClassToken(el.classes)
  if (classToken) {
    return `${tag}${typeAttr}[class*="${escapeAttr(classToken)}"]`
  }

  if (typeAttr) return `${tag}${typeAttr}`

  if (el.name?.trim()) {
    return `${tag}[name="${escapeAttr(el.name.trim())}"]`
  }

  if (el.placeholder?.trim()) {
    return `${tag}[placeholder="${escapeAttr(el.placeholder.trim())}"]`
  }

  return tag
}

function isHighStabilityAncestor(selector: string): boolean {
  return (
    /\[data-test(id|-id)?="/i.test(selector) ||
    /\[data-test="/i.test(selector) ||
    /\[data-cy="/i.test(selector) ||
    /\[data-qa="/i.test(selector)
  )
}

function sanitizeAncestorSelector(selector: string): string | null {
  const trimmed = selector.trim()
  if (!trimmed) return null

  if (isHighStabilityAncestor(trimmed)) return trimmed

  const idMatch = trimmed.match(/^([a-z][a-z0-9]*)#([\w-]+)$/i)
  if (idMatch) {
    const [, tag, id] = idMatch
    if (id && isStableId(id)) return `${tag}#${cssEscapeId(id)}`
    return tag ?? null
  }

  const withoutGenerated = trimmed
    .split('.')
    .filter((part, index) => index === 0 || !isGeneratedClass(part))
    .join('.')

  if (withoutGenerated && withoutGenerated !== trimmed.split('.')[0]) {
    return withoutGenerated
  }

  const tagOnly = trimmed.match(/^([a-z][a-z0-9]*)$/i)?.[1]
  return tagOnly ?? null
}

function cssEscapeId(id: string): string {
  return id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1')
}
