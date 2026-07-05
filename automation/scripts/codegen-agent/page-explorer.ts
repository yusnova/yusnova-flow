import * as fs from 'node:fs'
import * as path from 'node:path'
import { type Locator, type Page } from '@playwright/test'
import { createAuthenticatedPage } from './browser-session'
import { pickElementLocator } from './locator-priority'
import { ElementInfo, ElementKind } from './types'

export interface PageExploreOptions {
  url: string
  headless: boolean
  outputPath: string
  storageState?: string
}

const CLICK_TIMEOUT_MS = 5_000
const SKIP_BUTTON_PATTERN = /logout/i
const SKIP_LINK_DATA_TEST = /sidebar|logout/i
const SKIP_LINK_ID = /sidebar|burger/i

export class PageExplorer {
  async explore(opts: PageExploreOptions): Promise<string> {
    const { browser, page } = await createAuthenticatedPage({
      url: opts.url,
      headless: opts.headless,
      ...(opts.storageState ? { storageState: opts.storageState } : {}),
    })
    const lines: string[] = []
    let skipped = 0

    try {
      await this.exploreSelects(page, lines, () => {
        skipped += 1
      })
      await this.exploreButtons(page, lines, () => {
        skipped += 1
      })
      await this.exploreLinks(page, lines, () => {
        skipped += 1
      })
    } finally {
      await page.context().close()
      await browser.close()
    }

    if (skipped > 0) {
      console.log(
        `   \x1b[33m⚠\x1b[0m  Skipped ${skipped} element(s) that were hidden, external, or unstable (explore is best-effort, not a test run).`,
      )
    }

    const content = `${lines.join('\n')}\n`

    fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true })
    fs.writeFileSync(opts.outputPath, content, 'utf-8')
    return opts.outputPath
  }

  private async exploreSelects(page: Page, lines: string[], onSkip: () => void): Promise<void> {
    const selects = page.locator('select:visible')
    const count = await selects.count()

    for (let i = 0; i < count; i++) {
      const select = selects.nth(i)
      const selector = await this.resolveSelector(select)
      if (!selector) {
        onSkip()
        continue
      }

      const options = await select.locator('option').allTextContents()
      for (const option of options) {
        const line = `await page.locator(${JSON.stringify(selector)}).selectOption(${JSON.stringify(option)});`
        const ok = await this.tryAction(select, async () => {
          await select.selectOption(option, { timeout: CLICK_TIMEOUT_MS })
        })
        if (ok) lines.push(line)
        else onSkip()
      }
    }
  }

  private async exploreButtons(page: Page, lines: string[], onSkip: () => void): Promise<void> {
    const buttons = await page.locator('button:visible').all()

    for (const button of buttons) {
      const label = ((await button.textContent()) ?? '').trim()
      if (SKIP_BUTTON_PATTERN.test(label)) continue

      const selector = await this.resolveSelector(button)
      if (!selector) {
        onSkip()
        continue
      }

      const line = `await page.locator(${JSON.stringify(selector)}).click();`
      const ok = await this.tryAction(button, async () => {
        await button.click({ timeout: CLICK_TIMEOUT_MS })
      })
      if (ok) lines.push(line)
      else onSkip()
    }
  }

  private async exploreLinks(page: Page, lines: string[], onSkip: () => void): Promise<void> {
    const links = page.locator('a[href]')
    const count = await links.count()
    const startUrl = page.url()

    for (let i = 0; i < count; i++) {
      const link = links.nth(i)
      const href = (await link.getAttribute('href')) ?? ''
      if (!href || href.startsWith('#')) continue

      if (await this.shouldSkipLink(link, href, startUrl)) {
        onSkip()
        continue
      }

      const selector = await this.resolveSelector(link)
      if (!selector) {
        onSkip()
        continue
      }

      const line = `await page.locator(${JSON.stringify(selector)}).click();`
      const ok = await this.tryAction(link, async () => {
        await link.click({ timeout: CLICK_TIMEOUT_MS })
      })
      if (!ok) {
        onSkip()
        continue
      }

      lines.push(line)

      if (page.url() !== startUrl) {
        lines.push('await page.goBack();')
        try {
          await page.goBack({ timeout: CLICK_TIMEOUT_MS })
          await page.waitForLoadState('domcontentloaded').catch(() => undefined)
        } catch {
          await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
        }
      }
    }
  }

  private async shouldSkipLink(link: Locator, href: string, pageUrl: string): Promise<boolean> {
    const dataTest = (await link.getAttribute('data-test')) ?? ''
    const id = (await link.getAttribute('id')) ?? ''
    const className = (await link.getAttribute('class')) ?? ''

    if (SKIP_LINK_DATA_TEST.test(dataTest) || SKIP_LINK_ID.test(id)) return true
    if (/\bbm-item\b/.test(className)) return true
    if (this.isExternalHref(href, pageUrl)) return true
    if (!(await link.isVisible().catch(() => false))) return true

    return false
  }

  private isExternalHref(href: string, pageUrl: string): boolean {
    try {
      const resolved = new URL(href, pageUrl)
      return resolved.origin !== new URL(pageUrl).origin
    } catch {
      return false
    }
  }

  private async tryAction(locator: Locator, action: () => Promise<void>): Promise<boolean> {
    try {
      if (!(await locator.isVisible())) return false
      await action()
      return true
    } catch {
      return false
    }
  }

  private async resolveSelector(locator: Locator): Promise<string | null> {
    const attrs = await this.readElementAttributes(locator)
    if (!attrs) return null
    return pickElementLocator(attrs).selector
  }

  private async readElementAttributes(locator: Locator): Promise<ElementInfo | null> {
    return locator.evaluate((el): ElementInfo | null => {
      const node = el as HTMLElement & HTMLInputElement
      const tag = node.tagName.toLowerCase()
      const type = node.getAttribute('type') ?? undefined
      const role = node.getAttribute('role') ?? (tag === 'button' ? 'button' : tag === 'a' ? 'link' : undefined)
      const textContent = (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || undefined

      let kind: ElementKind = 'unknown'
      if (tag === 'button' || role === 'button') kind = 'button'
      else if (tag === 'a') kind = 'link'
      else if (tag === 'select') kind = 'select'

      return {
        kind,
        tagName: tag,
        ...(type ? { type } : {}),
        ...(node.id ? { id: node.id } : {}),
        ...(node.getAttribute('data-testid') ? { dataTestId: node.getAttribute('data-testid')! } : {}),
        ...(node.getAttribute('data-test-id') ? { dataTestIdHyphen: node.getAttribute('data-test-id')! } : {}),
        ...(node.getAttribute('data-test') ? { dataTest: node.getAttribute('data-test')! } : {}),
        ...(node.getAttribute('data-cy') ? { dataCy: node.getAttribute('data-cy')! } : {}),
        ...(node.getAttribute('data-qa') ? { dataQa: node.getAttribute('data-qa')! } : {}),
        ...(role ? { role } : {}),
        ...(node.getAttribute('aria-label') ? { ariaLabel: node.getAttribute('aria-label')! } : {}),
        ...(textContent ? { textContent, accessibleName: textContent } : {}),
        ...(node.getAttribute('name') ? { name: node.getAttribute('name')! } : {}),
        ...(node.getAttribute('placeholder') ? { placeholder: node.getAttribute('placeholder')! } : {}),
        classes: Array.from(node.classList),
        parentPath: '',
        ancestorSelectors: [],
        isRequired: false,
        isDisabled: node.hasAttribute('disabled'),
        index: 0,
      }
    }).catch(() => null)
  }
}
