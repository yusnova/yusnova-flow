import { cap } from './test-planner'
import { ResolvedElement, UiAction } from './types'

export interface RepeatingLocatorGroup {
  methodName: string
  paramName: string
  paramType: 'number' | 'string'
  selectorTemplate: string
  uiAction: UiAction
  memberPropertyNames: string[]
  listMethodName?: string
  listSelector?: string
}

export interface CollapsedLocators {
  singles: ResolvedElement[]
  groups: RepeatingLocatorGroup[]
}

const INDEXED_DATA_TEST = /^([a-z0-9]+(?:-[a-z0-9]+)*)-(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/i

export function collapseRepeatingLocators(elements: ResolvedElement[]): CollapsedLocators {
  const excluded = new Set<string>()
  const groups: RepeatingLocatorGroup[] = []

  groups.push(...detectIndexedGroups(elements, excluded))
  groups.push(...detectSlugPrefixGroups(elements, excluded, /^add-to-cart-(.+)$/i, 'addToCart', 'productSlug', 'add-to-cart-'))
  groups.push(...detectSlugPrefixGroups(elements, excluded, /^social-(.+)$/i, 'socialLink', 'network', 'social-'))

  dedupeIdenticalDataTest(elements, excluded)

  const singles = elements.filter((el) => !excluded.has(el.propertyName))
  return { singles, groups }
}

function detectIndexedGroups(
  elements: ResolvedElement[],
  excluded: Set<string>,
): RepeatingLocatorGroup[] {
  const buckets = new Map<string, Array<{ el: ResolvedElement; index: number }>>()

  for (const el of elements) {
    const dataTest = el.dataTest
    if (!dataTest) continue

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

    const methodName = `${kebabToCamel(prefix)}${cap(kebabToCamel(suffix))}`
    const memberPropertyNames = bucket.map((entry) => entry.el.propertyName)
    memberPropertyNames.forEach((name) => excluded.add(name))

    groups.push({
      methodName,
      paramName: 'index',
      paramType: 'number',
      selectorTemplate: `[data-test="${prefix}-\${index}-${suffix}"]`,
      uiAction: bucket[0]!.el.uiAction,
      memberPropertyNames,
      listMethodName: `${methodName}s`,
      listSelector: `[data-test^="${prefix}-"][data-test$="-${suffix}"]`,
    })
  }

  return groups
}

function dedupeIdenticalDataTest(elements: ResolvedElement[], excluded: Set<string>): void {
  const buckets = new Map<string, ResolvedElement[]>()

  for (const el of elements) {
    if (!el.dataTest || excluded.has(el.propertyName)) continue
    const bucket = buckets.get(el.dataTest) ?? []
    bucket.push(el)
    buckets.set(el.dataTest, bucket)
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
    if (!el.dataTest || excluded.has(el.propertyName)) continue
    if (!pattern.test(el.dataTest)) continue
    bucket.push(el)
  }

  if (bucket.length < 2) return []

  bucket.forEach((el) => excluded.add(el.propertyName))

  return [
    {
      methodName,
      paramName,
      paramType: 'string',
      selectorTemplate: `[data-test="${staticPrefix}\${${paramName}}"]`,
      uiAction: bucket[0]!.uiAction,
      memberPropertyNames: bucket.map((el) => el.propertyName),
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
