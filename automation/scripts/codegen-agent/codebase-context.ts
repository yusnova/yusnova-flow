import * as path from 'node:path'
import { CodebaseSelectorHint, scanCodebase } from '../shared/codebase-scanner'
import { ElementInfo, ResolvedElement } from './types'

function toPropertyName(context: string): string {
  const cleaned = context
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part, index) => (index === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join('')
  return cleaned || 'discoveredElement'
}

function hintToElement(hint: CodebaseSelectorHint, index: number): ElementInfo {
  const dataTest = hint.selector.match(/\[data-test="([^"]+)"\]/)?.[1]
  const dataTestId = hint.selector.match(/\[data-testid="([^"]+)"\]/)?.[1]
  const id = hint.selector.startsWith('#') ? hint.selector.slice(1) : undefined

  return {
    kind: 'unknown',
    tagName: 'div',
    ...(id ? { id } : {}),
    ...(dataTest ? { dataTest } : {}),
    ...(dataTestId ? { dataTestId } : {}),
    classes: [],
    parentPath: hint.filePath,
    ancestorSelectors: [],
    isRequired: false,
    isDisabled: false,
    index,
  }
}

function isHighConfidenceSelectorHint(hint: CodebaseSelectorHint): boolean {
  if (hint.strategy === 'data-test' || hint.strategy === 'data-testid') return true
  return /\[(data-testid|data-test-id|data-test|data-cy|data-qa)=/i.test(hint.selector)
}

function mapHintStrategy(hint: CodebaseSelectorHint): ResolvedElement['locator']['strategy'] {
  if (hint.strategy === 'data-testid') return 'data-testid'
  if (hint.strategy === 'data-test') return 'data-test'
  if (hint.strategy === 'id') return 'id'
  if (/\[data-test-id=/i.test(hint.selector)) return 'data-test-id'
  if (/\[data-cy=/i.test(hint.selector)) return 'data-cy'
  if (/\[data-qa=/i.test(hint.selector)) return 'data-qa'
  return 'css-path'
}

export function loadCodebaseInsights(repoRoot: string, domain?: string) {
  return scanCodebase(repoRoot, domain)
}

export function mergeCodebaseSelectors(
  resolved: ResolvedElement[],
  hints: CodebaseSelectorHint[],
  domain?: string,
): ResolvedElement[] {
  if (hints.length === 0) return resolved

  const domainLower = domain?.toLowerCase() ?? ''
  const existingSelectors = new Set(resolved.map((element) => element.locator.selector))
  const merged = [...resolved]
  let index = resolved.length

  for (const hint of hints) {
    if (domainLower) {
      const relevant =
        hint.filePath.toLowerCase().includes(domainLower)
        || hint.context.toLowerCase().includes(domainLower)
      if (!relevant && resolved.length > 0) continue
    }

    if (existingSelectors.has(hint.selector)) continue
    existingSelectors.add(hint.selector)

    const propertyName = toPropertyName(hint.context)
    merged.push({
      ...hintToElement(hint, index),
      propertyName,
      label: hint.context,
      locator: {
        selector: hint.selector,
        strategy: mapHintStrategy(hint),
        confidence: isHighConfidenceSelectorHint(hint) ? 'high' : 'medium',
      },
      uiAction: 'clickElement',
    })
    index += 1
  }

  return merged
}

export function resolveRepoRoot(automationRoot: string): string {
  return path.resolve(automationRoot, '..')
}
