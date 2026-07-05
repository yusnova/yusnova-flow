import { createAuthenticatedPage } from './browser-session'
import { ElementInfo, ElementKind, ElementMap } from './types'

export { labelFromElement, propertyNameFromElement } from './element-naming'

export class PageAnalyser {
  async analyse(url: string, headless: boolean, storageState?: string): Promise<ElementMap> {
    const { browser, page } = await createAuthenticatedPage({
      url,
      headless,
      ...(storageState ? { storageState } : {}),
    })

    try {
      const pageTitle = await page.title()
      const elements = await page.evaluate<ElementInfo[]>((): ElementInfo[] => {
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

        function getImplicitRole(el: Element): string | undefined {
          const explicit = el.getAttribute('role')?.trim().toLowerCase()
          if (explicit) return explicit
          const tag = el.tagName.toLowerCase()
          if (tag === 'button') return 'button'
          if (tag === 'a') return 'link'
          if (tag === 'select') return 'combobox'
          if (tag === 'textarea') return 'textbox'
          if (tag === 'input') {
            const type = (el.getAttribute('type') ?? 'text').toLowerCase()
            if (type === 'checkbox') return 'checkbox'
            if (type === 'radio') return 'radio'
            if (type === 'submit' || type === 'button') return 'button'
            return 'textbox'
          }
          return undefined
        }

        function getAccessibleName(el: HTMLElement): string | undefined {
          const ariaLabel = el.getAttribute('aria-label')?.trim()
          if (ariaLabel) return ariaLabel.slice(0, 80)

          const labelledBy = el.getAttribute('aria-labelledby')?.trim()
          if (labelledBy) {
            const labelEl = document.getElementById(labelledBy)
            const text = labelEl?.textContent?.trim().replace(/\s+/g, ' ')
            if (text) return text.slice(0, 80)
          }

          const id = el.id?.trim()
          if (id) {
            const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
            const text = label?.textContent?.trim().replace(/\s+/g, ' ')
            if (text) return text.slice(0, 80)
          }

          const tag = el.tagName.toLowerCase()
          const role = el.getAttribute('role')?.toLowerCase()
          if (tag === 'button' || tag === 'a' || role === 'button' || role === 'link') {
            const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
            if (text) return text.slice(0, 80)
          }

          const title = el.getAttribute('title')?.trim()
          if (title) return title.slice(0, 80)

          return undefined
        }

        function buildAncestorFragment(el: Element): string {
          const tag = el.tagName.toLowerCase()
          const testAttrs = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'] as const

          for (const attr of testAttrs) {
            const value = el.getAttribute(attr)?.trim()
            if (value) return `${tag}[${attr}="${value.replace(/"/g, '\\"')}"]`
          }

          const id = el.id?.trim()
          if (id && isStableId(id)) return `${tag}#${id}`

          const stableClass = Array.from(el.classList).find(
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

        function getAncestorSelectors(el: Element): string[] {
          const ancestors: string[] = []
          let current = el.parentElement
          let level = 0

          while (current && level < 3) {
            ancestors.unshift(buildAncestorFragment(current))
            current = current.parentElement
            level++
          }

          return ancestors
        }

        function getKind(el: Element): ElementKind {
          const tag = el.tagName.toLowerCase()
          const type = (el.getAttribute('type') ?? '').toLowerCase()
          const role = (el.getAttribute('role') ?? '').toLowerCase()

          if (tag === 'input') {
            if (type === 'checkbox') return 'input-checkbox'
            if (type === 'radio') return 'input-radio'
            if (type === 'file') return 'input-file'
            if (type === 'password') return 'input-password'
            if (type === 'email') return 'input-email'
            if (type === 'number') return 'input-number'
            return 'input-text'
          }
          if (tag === 'select') return 'select'
          if (tag === 'textarea') return 'textarea'
          if (tag === 'button' || role === 'button') return 'button'
          if (tag === 'a') return 'link'
          return 'unknown'
        }

        const query = [
          'input:not([type="hidden"])',
          'button',
          'select',
          'textarea',
          'a[href]',
          '[role="button"]',
          '[role="textbox"]',
          '[role="combobox"]',
          '[data-testid]',
          '[data-test-id]',
          '[data-test]',
          '[data-cy]',
          '[data-qa]',
        ].join(', ')

        const seen = new Set<string>()
        const results: ElementInfo[] = []
        let idx = 0

        function getSelectOptions(el: Element): string[] | undefined {
          if (el.tagName.toLowerCase() !== 'select') return undefined
          const select = el as HTMLSelectElement
          const options = Array.from(select.options)
            .map((option) => (option.textContent ?? '').trim())
            .filter((label) => label.length > 0)
          return options.length > 0 ? options : undefined
        }

        document.querySelectorAll(query).forEach((rawEl) => {
          const el = rawEl as HTMLElement & HTMLInputElement & HTMLAnchorElement
          const rect = el.getBoundingClientRect()
          if (rect.width === 0 && rect.height === 0) return

          const key = el.outerHTML.slice(0, 120)
          if (seen.has(key)) return
          seen.add(key)

          const classes = Array.from(el.classList).filter((c) => !generatedClass.test(c))
          const ancestorSelectors = getAncestorSelectors(el)
          const textContent =
            (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || undefined
          const role = getImplicitRole(el)
          const accessibleName = getAccessibleName(el)
          const selectOptions = getSelectOptions(el)

          results.push({
            kind: getKind(el) as ElementKind,
            tagName: el.tagName.toLowerCase(),
            ...(el.getAttribute('type') ? { type: el.getAttribute('type')! } : {}),
            ...(el.id ? { id: el.id } : {}),
            ...(el.getAttribute('data-testid') ? { dataTestId: el.getAttribute('data-testid')! } : {}),
            ...(el.getAttribute('data-test-id') ? { dataTestIdHyphen: el.getAttribute('data-test-id')! } : {}),
            ...(el.getAttribute('data-test') ? { dataTest: el.getAttribute('data-test')! } : {}),
            ...(el.getAttribute('data-cy') ? { dataCy: el.getAttribute('data-cy')! } : {}),
            ...(el.getAttribute('data-qa') ? { dataQa: el.getAttribute('data-qa')! } : {}),
            ...(role ? { role } : {}),
            ...(accessibleName ? { accessibleName } : {}),
            ...(el.getAttribute('name') ? { name: el.getAttribute('name')! } : {}),
            ...(el.getAttribute('aria-label') ? { ariaLabel: el.getAttribute('aria-label')! } : {}),
            ...(el.getAttribute('placeholder') ? { placeholder: el.getAttribute('placeholder')! } : {}),
            ...(textContent ? { textContent } : {}),
            ...(el.getAttribute('href') ? { href: el.getAttribute('href')! } : {}),
            ...(selectOptions ? { selectOptions } : {}),
            classes,
            parentPath: ancestorSelectors.join(' > '),
            ancestorSelectors,
            isRequired: el.required || el.getAttribute('required') !== null,
            isDisabled: el.disabled || false,
            index: idx++,
          } as ElementInfo)
        })

        return results
      })

      return { url, pageTitle, elements, timestamp: new Date().toISOString() }
    } finally {
      await page.context().close()
      await browser.close()
    }
  }
}
