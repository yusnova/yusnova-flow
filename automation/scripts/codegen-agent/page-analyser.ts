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
        const generatedClass = /^(css-|sc-|chakra-|_[a-z]|[a-z]+-[a-f0-9]{5,})/

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

        function getAncestorSelectors(el: Element): string[] {
          const ancestors: string[] = []
          let current = el.parentElement
          let level = 0

          while (current && level < 3) {
            const tag = current.tagName.toLowerCase()
            const testId = current.getAttribute('data-testid')
            const id = current.id
            const stableClasses = Array.from(current.classList)
              .filter((c) => !generatedClass.test(c))
              .slice(0, 2)
              .map((c) => `.${c}`)
              .join('')

            const frag = testId
              ? `${tag}[data-testid="${testId}"]`
              : id
                ? `${tag}#${id}`
                : `${tag}${stableClasses}`

            ancestors.unshift(frag || tag)
            current = current.parentElement
            level++
          }

          return ancestors
        }

        const query = [
          'input:not([type="hidden"])',
          'button',
          'select',
          'textarea',
          'a[data-test]',
          'a[href]',
          '[role="button"]',
          '[role="textbox"]',
          '[role="combobox"]',
          '[data-test]',
        ].join(', ')

        const seen = new Set<string>()
        const results: ElementInfo[] = []
        let idx = 0

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

          results.push({
            kind: getKind(el) as ElementKind,
            tagName: el.tagName.toLowerCase(),
            ...(el.getAttribute('type') ? { type: el.getAttribute('type')! } : {}),
            ...(el.id ? { id: el.id } : {}),
            ...(el.getAttribute('data-testid') ? { dataTestId: el.getAttribute('data-testid')! } : {}),
            ...(el.getAttribute('data-test') ? { dataTest: el.getAttribute('data-test')! } : {}),
            ...(el.getAttribute('name') ? { name: el.getAttribute('name')! } : {}),
            ...(el.getAttribute('aria-label') ? { ariaLabel: el.getAttribute('aria-label')! } : {}),
            ...(el.getAttribute('placeholder') ? { placeholder: el.getAttribute('placeholder')! } : {}),
            ...(textContent ? { textContent } : {}),
            ...(el.getAttribute('href') ? { href: el.getAttribute('href')! } : {}),
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
