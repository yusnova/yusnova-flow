import { cap } from '@codegen-agent/planning/test-planner'
import { ResolvedElement, UiAction } from '../types'

export interface RepeatingLocatorGroup {
  methodName: string
  paramName: string
  paramType: 'number' | 'string'
  selectorTemplate: string
  uiAction: UiAction
  memberPropertyNames: string[]
  /** Prefer data-testid when that is what the DOM uses. */
  attr: 'data-testid' | 'data-test'
  listMethodName?: string
  listSelector?: string
  /** True when members are radios (specs use BasePage.check). */
  isRadioGroup?: boolean
}

export interface CollapsedLocators {
  singles: ResolvedElement[]
  groups: RepeatingLocatorGroup[]
}

const INDEXED_DATA_TEST = /^([a-z0-9]+(?:-[a-z0-9]+)*)-(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/i

/** Interactive kinds that may share a parameterized locator family. */
const GROUPABLE_KINDS = new Set([
  'input-radio',
  'input-checkbox',
  'button',
  'link',
  'input-text',
  'input-email',
  'input-password',
  'input-number',
  'select',
  'textarea',
])

/**
 * Collapse repeating data-test(id) families into parameterized locator methods.
 *
 * Order matters: shared-prefix (slug) runs before indexed so families like
 * `skip-option-2-yard` become `skipOption('2-yard')` instead of `skipOptionYard(2)`.
 */
export function collapseRepeatingLocators(elements: ResolvedElement[]): CollapsedLocators {
  const excluded = new Set<string>()
  const groups: RepeatingLocatorGroup[] = []

  groups.push(...detectSharedPrefixGroups(elements, excluded))
  groups.push(...detectIndexedGroups(elements, excluded))
  groups.push(...detectSlugPrefixGroups(elements, excluded, /^add-to-cart-(.+)$/i, 'addToCart', 'productSlug', 'add-to-cart-'))
  groups.push(...detectSlugPrefixGroups(elements, excluded, /^social-(.+)$/i, 'socialLink', 'network', 'social-'))

  dedupeIdenticalDataTest(elements, excluded)

  const singles = elements.filter((el) => !excluded.has(el.propertyName))
  return { singles, groups }
}

function dataTestOf(el: ResolvedElement): string | undefined {
  return el.dataTest ?? el.dataTestId ?? el.dataTestIdHyphen
}

function attrOf(el: ResolvedElement): 'data-testid' | 'data-test' {
  const selector = el.locator?.selector ?? ''
  if (selector.includes('data-testid') || el.dataTestId || el.dataTestIdHyphen) return 'data-testid'
  return 'data-test'
}

function isRadio(el: ResolvedElement): boolean {
  return el.kind === 'input-radio'
}

function isGroupable(el: ResolvedElement): boolean {
  return GROUPABLE_KINDS.has(el.kind)
}

function detectIndexedGroups(
  elements: ResolvedElement[],
  excluded: Set<string>,
): RepeatingLocatorGroup[] {
  const buckets = new Map<string, Array<{ el: ResolvedElement; index: number }>>()

  for (const el of elements) {
    const dataTest = dataTestOf(el)
    if (!dataTest || excluded.has(el.propertyName)) continue

    const match = dataTest.match(INDEXED_DATA_TEST)
    if (!match) continue

    const [, prefix, indexRaw, suffix] = match
    if (!prefix || !indexRaw || !suffix) continue

    const key = `${prefix}::${suffix}`
    const bucket = buckets.get(key) ?? []
    bucket.push({ el, index: Number.parseInt(indexRaw, 10) })
    buckets.set(key, bucket)
  }

  const groups: RepeatingLocatorGroup[] = []

  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue

    const [prefix, suffix] = key.split('::')
    if (!prefix || !suffix) continue

    const sample = bucket[0]!.el
    const attr = attrOf(sample)
    const methodName = `${kebabToCamel(prefix)}${cap(kebabToCamel(suffix))}`
    const memberPropertyNames = bucket.map((entry) => entry.el.propertyName)
    memberPropertyNames.forEach((name) => excluded.add(name))

    // Indexed catalogs (item-N-title) may need list count/first assertions.
    groups.push({
      methodName,
      paramName: 'index',
      paramType: 'number',
      selectorTemplate: `[${attr}="${prefix}-\${index}-${suffix}"]`,
      uiAction: sample.uiAction,
      memberPropertyNames,
      attr,
      listMethodName: `${methodName}s`,
      listSelector: `[${attr}^="${prefix}-"][${attr}$="-${suffix}"]`,
      isRadioGroup: bucket.every((entry) => isRadio(entry.el)),
    })
  }

  return groups
}

/**
 * Collapse families that share a multi-segment prefix, e.g.
 * `plan-tier-gold` / `plan-tier-silver` → `planTier(optionId)`.
 *
 * Requires ≥2 static kebab segments so unrelated singles (e.g. `confirm-order`
 * vs `start-again`) are not merged. All members must share the same kind.
 */
function detectSharedPrefixGroups(
  elements: ResolvedElement[],
  excluded: Set<string>,
): RepeatingLocatorGroup[] {
  const candidates = elements.filter((el) => {
    const dataTest = dataTestOf(el)
    return (
      isGroupable(el) &&
      Boolean(dataTest) &&
      !excluded.has(el.propertyName) &&
      (dataTest?.includes('-') ?? false)
    )
  })

  const byPrefix = new Map<string, ResolvedElement[]>()

  for (const el of candidates) {
    const dataTest = dataTestOf(el)!
    const parts = dataTest.split('-')
    if (parts.length < 2) continue
    // Keep at least two static segments (`waste-path-`, `address-option-`, `next-from-step`).
    for (let keep = parts.length - 1; keep >= 2; keep -= 1) {
      const prefix = `${parts.slice(0, keep).join('-')}-`
      const suffix = parts.slice(keep).join('-')
      if (!suffix) continue
      const bucket = byPrefix.get(prefix) ?? []
      if (!bucket.includes(el)) bucket.push(el)
      byPrefix.set(prefix, bucket)
    }
  }

  // Prefer longer prefixes so `address-option-` wins over shorter stems.
  const ranked = [...byPrefix.entries()]
    .filter(([, bucket]) => bucket.length >= 2)
    .sort((a, b) => b[0].length - a[0].length || b[1].length - a[1].length)

  const groups: RepeatingLocatorGroup[] = []
  const claimed = new Set<string>()

  for (const [prefix, bucket] of ranked) {
    const free = bucket.filter((el) => !claimed.has(el.propertyName) && !excluded.has(el.propertyName))
    if (free.length < 2) continue

    const kinds = new Set(free.map((el) => el.kind))
    if (kinds.size > 1) continue

    const suffixes = new Set(free.map((el) => dataTestOf(el)!.slice(prefix.length)))
    if (suffixes.size < 2) continue

    const sample = free[0]!
    const attr = attrOf(sample)
    const staticStem = prefix.replace(/-$/, '')
    const methodName = kebabToCamel(staticStem)
    const paramName = 'optionId'

    free.forEach((el) => {
      claimed.add(el.propertyName)
      excluded.add(el.propertyName)
    })

    // Slug/option families: parameterized member locator is enough.
    // Do not emit redundant `fooOptions()` prefix lists (unused + awkward names).
    groups.push({
      methodName,
      paramName,
      paramType: 'string',
      selectorTemplate: `[${attr}="${prefix}\${${paramName}}"]`,
      uiAction: sample.uiAction,
      memberPropertyNames: free.map((el) => el.propertyName),
      attr,
      isRadioGroup: free.every((el) => isRadio(el)),
    })
  }

  return groups
}

function dedupeIdenticalDataTest(elements: ResolvedElement[], excluded: Set<string>): void {
  const buckets = new Map<string, ResolvedElement[]>()

  for (const el of elements) {
    const dataTest = dataTestOf(el)
    if (!dataTest || excluded.has(el.propertyName)) continue
    const bucket = buckets.get(dataTest) ?? []
    bucket.push(el)
    buckets.set(dataTest, bucket)
  }

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue
    for (let index = 1; index < bucket.length; index += 1) {
      excluded.add(bucket[index]!.propertyName)
    }
  }
}

function detectSlugPrefixGroups(
  elements: ResolvedElement[],
  excluded: Set<string>,
  pattern: RegExp,
  methodName: string,
  paramName: string,
  staticPrefix: string,
): RepeatingLocatorGroup[] {
  const bucket: ResolvedElement[] = []

  for (const el of elements) {
    const dataTest = dataTestOf(el)
    if (!dataTest || excluded.has(el.propertyName)) continue
    if (!pattern.test(dataTest)) continue
    bucket.push(el)
  }

  if (bucket.length < 2) return []

  bucket.forEach((el) => excluded.add(el.propertyName))
  const sample = bucket[0]!
  const attr = attrOf(sample)

  return [
    {
      methodName,
      paramName,
      paramType: 'string',
      selectorTemplate: `[${attr}="${staticPrefix}\${${paramName}}"]`,
      uiAction: sample.uiAction,
      memberPropertyNames: bucket.map((el) => el.propertyName),
      attr,
      isRadioGroup: bucket.every((el) => isRadio(el)),
    },
  ]
}

function kebabToCamel(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('')
}

export function parseIndexedDataTest(
  dataTest: string,
): { prefix: string; index: number; suffix: string } | null {
  const match = dataTest.match(INDEXED_DATA_TEST)
  if (!match) return null

  const [, prefix, indexRaw, suffix] = match
  if (!prefix || !indexRaw || !suffix) return null

  return { prefix, index: Number.parseInt(indexRaw, 10), suffix }
}

export function parseSlugDataTest(
  dataTest: string,
  pattern: RegExp,
): string | null {
  const match = dataTest.match(pattern)
  return match?.[1] ?? null
}

export function findRepeatingGroupForDataTest(
  groups: RepeatingLocatorGroup[],
  dataTest: string,
): { group: RepeatingLocatorGroup; arg: string | number } | null {
  // Prefer string/slug groups first (shared-prefix / add-to-cart / social).
  const prefixMatches = groups
    .filter((group) => group.paramType === 'string' && group.selectorTemplate.includes('${'))
    .map((group) => {
      const staticPrefix = extractStaticPrefix(group.selectorTemplate)
      if (!staticPrefix || !dataTest.startsWith(staticPrefix)) return null
      return { group, arg: dataTest.slice(staticPrefix.length), prefixLen: staticPrefix.length }
    })
    .filter((entry): entry is { group: RepeatingLocatorGroup; arg: string; prefixLen: number } => Boolean(entry))
    .sort((a, b) => b.prefixLen - a.prefixLen)

  if (prefixMatches[0]) return { group: prefixMatches[0].group, arg: prefixMatches[0].arg }

  const indexed = parseIndexedDataTest(dataTest)
  if (indexed) {
    const methodName = `${kebabToCamel(indexed.prefix)}${cap(kebabToCamel(indexed.suffix))}`
    const group = groups.find((entry) => entry.methodName === methodName)
    if (group) return { group, arg: indexed.index }
  }

  const addToCart = parseSlugDataTest(dataTest, /^add-to-cart-(.+)$/i)
  if (addToCart) {
    const group = groups.find((entry) => entry.methodName === 'addToCart')
    if (group) return { group, arg: addToCart }
  }

  const social = parseSlugDataTest(dataTest, /^social-(.+)$/i)
  if (social) {
    const group = groups.find((entry) => entry.methodName === 'socialLink')
    if (group) return { group, arg: social }
  }

  return null
}

function extractStaticPrefix(selectorTemplate: string): string | null {
  // [data-testid="address-option-${optionId}"] → address-option-
  const match = selectorTemplate.match(/\[[^\]]+="([^"$]+)\$\{/)
  return match?.[1] ?? null
}

/** Spec expression for a group member: `pageVar.method('arg')` or `pageVar.method(2)`. */
export function pomGroupMemberExpr(
  pageVar: string,
  group: RepeatingLocatorGroup,
  arg: string | number,
): string {
  const formatted = typeof arg === 'number' ? String(arg) : JSON.stringify(arg)
  return `${pageVar}.${group.methodName}(${formatted})`
}
