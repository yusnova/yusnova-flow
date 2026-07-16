import { type Locator, type Page } from '@playwright/test'
import { pickElementLocator } from '@codegen-agent/locators/locator-priority'
import { ElementInfo, ElementKind } from '../types'

export interface DomScanOptions {
  /** Limit scan to this locator (e.g. open modal root). */
  scope?: Locator
  /** Label for property naming (e.g. confirmDialog). */
  surfaceContext?: string
}

export function elementDedupKey(el: ElementInfo): string {
  const locator = pickElementLocator(el).selector
  const context = el.surfaceContext ?? ''
  return `${context}::${locator}`
}

export function mergeElementInfos(...lists: ElementInfo[][]): ElementInfo[] {
  const merged: ElementInfo[] = []
  const seen = new Set<string>()

  for (const list of lists) {
    for (const el of list) {
      const key = elementDedupKey(el)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(el)
    }
  }

  return merged.map((el, index) => ({ ...el, index }))
}

/**
 * Self-contained browser function — must not reference module-scope symbols.
 * Playwright serializes only this function body into the page context.
 */
function scanDomFromElement(el: Element, surfaceContext: string): ElementInfo[] {
  const root = el
  const INTERACTIVE_QUERY = [
    'input:not([type="hidden"])',
    'button',
    'select',
    'textarea',
    'a[href]',
    '[role="button"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="option"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[data-testid]',
    '[data-test-id]',
    '[data-test]',
    '[data-cy]',
    '[data-qa]',
    'table button',
    'table a[href]',
    'table [role="button"]',
    '[role="dialog"] button',
    '[role="dialog"] a[href]',
    '[role="dialog"] input:not([type="hidden"])',
    '[aria-modal="true"] button',
    '[aria-modal="true"] a[href]',
    '[aria-modal="true"] input:not([type="hidden"])',
  ].join(', ')

  const generatedClass = /^(css-|sc-|chakra-|mui-|emotion-|_[a-z]|[a-z]+-[a-f0-9]{5,})/i
  const dynamicIdPatterns = [
    /^:r\d+:?$/,
    /^mui-\d+$/i,
    /^react-select-\d+-/i,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    /\d{6,}/,
    /-\d{5,}(?:-\d+)*$/,
  ]
  const stableIdPattern = /^[a-z][a-z0-9_-]{1,48}$/i

  function isDynamicId(id: string): boolean {
    const trimmed = id.trim()
    if (!trimmed || trimmed.length > 64) return true
    return dynamicIdPatterns.some((pattern) => pattern.test(trimmed))
  }

  function isStableId(id: string): boolean {
    const trimmed = id.trim()
    if (!trimmed || isDynamicId(trimmed)) return false
    return stableIdPattern.test(trimmed)
  }

  function isVisibleEnough(node: Element): boolean {
    const el = node as HTMLElement
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return true

    const role = el.getAttribute('role')?.toLowerCase()
    if (role === 'dialog' || role === 'alertdialog' || el.getAttribute('aria-modal') === 'true') {
      return true
    }

    const style = window.getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden' && el.getAttribute('aria-hidden') !== 'true'
  }

  function getImplicitRole(node: Element): string | undefined {
    const explicit = node.getAttribute('role')?.trim().toLowerCase()
    if (explicit) return explicit
    const tag = node.tagName.toLowerCase()
    if (tag === 'button') return 'button'
    if (tag === 'a') return 'link'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'input') {
      const type = (node.getAttribute('type') ?? 'text').toLowerCase()
      if (type === 'checkbox') return 'checkbox'
      if (type === 'radio') return 'radio'
      if (type === 'submit' || type === 'button') return 'button'
      return 'textbox'
    }
    return undefined
  }

  function getAccessibleName(node: HTMLElement): string | undefined {
    const ariaLabel = node.getAttribute('aria-label')?.trim()
    if (ariaLabel) return ariaLabel.slice(0, 80)

    const labelledBy = node.getAttribute('aria-labelledby')?.trim()
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy)
      const text = labelEl?.textContent?.trim().replace(/\s+/g, ' ')
      if (text) return text.slice(0, 80)
    }

    const id = node.id?.trim()
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
      const text = label?.textContent?.trim().replace(/\s+/g, ' ')
      if (text) return text.slice(0, 80)
    }

    const tag = node.tagName.toLowerCase()
    const role = node.getAttribute('role')?.toLowerCase()
    if (tag === 'button' || tag === 'a' || role === 'button' || role === 'link' || role === 'option' || role === 'menuitem') {
      const text = (node.textContent ?? '').trim().replace(/\s+/g, ' ')
      if (text) return text.slice(0, 80)
    }

    const title = node.getAttribute('title')?.trim()
    if (title) return title.slice(0, 80)

    return undefined
  }

  function buildAncestorFragment(node: Element): string {
    const tag = node.tagName.toLowerCase()
    const testAttrs = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'] as const

    for (const attr of testAttrs) {
      const value = node.getAttribute(attr)?.trim()
      if (value) return `${tag}[${attr}="${value.replace(/"/g, '\\"')}"]`
    }

    const id = node.id?.trim()
    if (id && isStableId(id)) return `${tag}#${id}`

    const stableClass = Array.from(node.classList).find(
      (cls) => !generatedClass.test(cls) && cls.length > 2,
    )
    if (stableClass) {
      const token = stableClass.includes('_') || stableClass.includes('-')
        ? stableClass.replace(/_/g, '-')
        : stableClass
      return `${tag}[class*="${token.replace(/"/g, '\\"')}"]`
    }

    return tag
  }

  function getAncestorSelectors(node: Element): string[] {
    const ancestors: string[] = []
    let current = node.parentElement
    let level = 0

    while (current && level < 3) {
      ancestors.unshift(buildAncestorFragment(current))
      current = current.parentElement
      level++
    }

    return ancestors
  }

  function getKind(node: Element): ElementKind {
    const tag = node.tagName.toLowerCase()
    const type = (node.getAttribute('type') ?? '').toLowerCase()
    const role = (node.getAttribute('role') ?? '').toLowerCase()

    if (role === 'option' || role === 'menuitem') return 'button'
    if (tag === 'input') {
      if (type === 'checkbox') return 'input-checkbox'
      if (type === 'radio') return 'input-radio'
      if (type === 'file') return 'input-file'
      if (type === 'password') return 'input-password'
      if (type === 'email') return 'input-email'
      if (type === 'number') return 'input-number'
      return 'input-text'
    }
    if (tag === 'select' || role === 'combobox') return 'select'
    if (tag === 'textarea' || role === 'textbox') return 'textarea'
    if (tag === 'button' || role === 'button') return 'button'
    if (tag === 'a' || role === 'link') return 'link'
    return 'unknown'
  }

  function getSelectOptions(node: Element): string[] | undefined {
    if (node.tagName.toLowerCase() !== 'select') return undefined
    const select = node as HTMLSelectElement
    const options = Array.from(select.options)
      .map((option) => (option.textContent ?? '').trim())
      .filter((label) => label.length > 0)
    return options.length > 0 ? options : undefined
  }

  const seen = new Set<string>()
  const results: ElementInfo[] = []
  let idx = 0

  root.querySelectorAll(INTERACTIVE_QUERY).forEach((rawEl) => {
    const node = rawEl as HTMLElement & HTMLInputElement & HTMLAnchorElement
    if (!isVisibleEnough(node)) return

    const key = node.outerHTML.slice(0, 120)
    if (seen.has(key)) return
    seen.add(key)

    const classes = Array.from(node.classList).filter((c) => !generatedClass.test(c))
    const ancestorSelectors = getAncestorSelectors(node)
    const textContent =
      (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || undefined
    const role = getImplicitRole(node)
    const accessibleName = getAccessibleName(node)
    const selectOptions = getSelectOptions(node)

    results.push({
      kind: getKind(node) as ElementKind,
      tagName: node.tagName.toLowerCase(),
      ...(node.getAttribute('type') ? { type: node.getAttribute('type')! } : {}),
      ...(node.id ? { id: node.id } : {}),
      ...(node.getAttribute('data-testid') ? { dataTestId: node.getAttribute('data-testid')! } : {}),
      ...(node.getAttribute('data-test-id') ? { dataTestIdHyphen: node.getAttribute('data-test-id')! } : {}),
      ...(node.getAttribute('data-test') ? { dataTest: node.getAttribute('data-test')! } : {}),
      ...(node.getAttribute('data-cy') ? { dataCy: node.getAttribute('data-cy')! } : {}),
      ...(node.getAttribute('data-qa') ? { dataQa: node.getAttribute('data-qa')! } : {}),
      ...(role ? { role } : {}),
      ...(accessibleName ? { accessibleName } : {}),
      ...(node.getAttribute('name') ? { name: node.getAttribute('name')! } : {}),
      ...(node.getAttribute('aria-label') ? { ariaLabel: node.getAttribute('aria-label')! } : {}),
      ...(node.getAttribute('placeholder') ? { placeholder: node.getAttribute('placeholder')! } : {}),
      ...(textContent ? { textContent } : {}),
      ...(node.getAttribute('href') ? { href: node.getAttribute('href')! } : {}),
      ...(selectOptions ? { selectOptions } : {}),
      ...(surfaceContext ? { surfaceContext } : {}),
      classes,
      parentPath: ancestorSelectors.join(' > '),
      ancestorSelectors,
      isRequired: node.required || node.getAttribute('required') !== null,
      isDisabled: node.disabled || node.getAttribute('aria-disabled') === 'true',
      index: idx++,
    } as ElementInfo)
  })

  return results
}

export async function scanPageElements(page: Page, options: DomScanOptions = {}): Promise<ElementInfo[]> {
  const surfaceContext = options.surfaceContext ?? ''
  const root = options.scope ?? page.locator('html')
  return root.evaluate(scanDomFromElement, surfaceContext)
}
