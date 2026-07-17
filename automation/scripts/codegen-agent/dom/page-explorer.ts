import * as fs from 'node:fs'
import * as path from 'node:path'
import { type Locator, type Page } from '@playwright/test'
import { createAuthenticatedPage } from './browser-session'
import { scanPageElements } from './dom-scanner'
import { dismissOverlay, findOpenOverlays } from './overlay-utils'
import { pickElementLocator } from '@codegen-agent/locators/locator-priority'
import { ElementInfo } from '../types'

export interface PageExploreOptions {
  url: string
  headless: boolean
  outputPath: string
  storageState?: string
}

export interface PageExploreResult {
  outputPath: string
  discoveredElements: ElementInfo[]
}

const CLICK_TIMEOUT_MS = 5_000
const SKIP_BUTTON_PATTERN = /logout|retry|start\s*again|dismiss|close\b/i
const SKIP_LINK_DATA_TEST = /sidebar|logout/i
const SKIP_LINK_ID = /sidebar|burger/i
const SKIP_OVERLAY_ACTION_PATTERN = /delete|remove|submit|confirm|pay|purchase|logout|retry/i
const SKIP_EXPLORE_BUTTON = /retry|error|lookup-error|start[-_ ]?again|normalize|demo/i

export class PageExplorer {
  async explore(opts: PageExploreOptions): Promise<PageExploreResult> {
    const { browser, page } = await createAuthenticatedPage({
      url: opts.url,
      headless: opts.headless,
      ...(opts.storageState ? { storageState: opts.storageState } : {}),
    })

    const lines: string[] = []
    const discoveredElements: ElementInfo[] = []
    let skipped = 0

    const recordElements = (elements: ElementInfo[]) => {
      for (const el of elements) {
        discoveredElements.push(el)
      }
    }

    try {
      recordElements(await scanPageElements(page))

      // Multi-step wizard advancement: fill inputs with realistic values and
      // click the primary "advance" control to reach downstream steps, scanning
      // the newly revealed elements at each stage. Best-effort, non-destructive.
      await this.advanceWizard(page, recordElements, () => {
        skipped += 1
      })

      await this.exploreSelects(page, lines, () => {
        skipped += 1
      })
      await this.exploreComboboxes(page, lines, recordElements, () => {
        skipped += 1
      })
      await this.exploreButtons(page, lines, recordElements, () => {
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

    return {
      outputPath: opts.outputPath,
      discoveredElements,
    }
  }

  /**
   * Walk a multi-step form/wizard: on each step fill visible empty inputs with
   * realistic values, pick the first option in radio/option groups, then click a
   * primary advance control (Next/Continue/Lookup/…). Re-scans after each hop to
   * capture elements that only exist on later steps. Deterministic + best-effort.
   */
  private async advanceWizard(
    page: Page,
    recordElements: (elements: ElementInfo[]) => void,
    onSkip: () => void,
  ): Promise<void> {
    const MAX_STEPS = 8
    const ADVANCE = /next|continue|proceed|look\s*up|search|show|get.*(quote|skip)|review|confirm|book|submit|apply/i
    const BACK = /back|previous|cancel|prev\b/i
    const startUrl = page.url()

    for (let step = 0; step < MAX_STEPS; step++) {
      await this.fillVisibleInputs(page)
      await this.pickFirstOptions(page)

      const buttonsLocator = page.locator('button:visible, [role="button"]:visible')
      const count = await buttonsLocator.count().catch(() => 0)
      let advanced = false

      for (let i = 0; i < count; i++) {
        const button = buttonsLocator.nth(i)
        const label = await this.readLabel(button)
        if (!ADVANCE.test(label) || BACK.test(label)) continue
        if (SKIP_BUTTON_PATTERN.test(label)) continue

        const before = await page.content().catch(() => '')
        const clicked = await this.tryAction(button, async () => {
          await button.click({ timeout: CLICK_TIMEOUT_MS })
        })
        if (!clicked) {
          onSkip()
          continue
        }

        await page.waitForLoadState('domcontentloaded').catch(() => undefined)
        await page.waitForTimeout(700)
        const after = await page.content().catch(() => '')
        if (after !== before) {
          recordElements(await scanPageElements(page))
          advanced = true
          break
        }
      }

      if (!advanced) break
    }

    // Reload the entry page so the generic (button/link) exploration below runs
    // against a stable step 1 instead of a deep wizard state. A full reload also
    // resets client-side wizards that keep step state in memory (no URL change).
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
    await page.waitForTimeout(300)
  }

  /** Read a button's label from text + data-testid + aria-label with bounded timeouts. */
  private async readLabel(locator: Locator): Promise<string> {
    const text = await locator.textContent({ timeout: 1_500 }).catch(() => '')
    const testId = await locator.getAttribute('data-testid', { timeout: 1_500 }).catch(() => '')
    const aria = await locator.getAttribute('aria-label', { timeout: 1_500 }).catch(() => '')
    return `${text ?? ''} ${testId ?? ''} ${aria ?? ''}`.trim()
  }

  private async fillVisibleInputs(page: Page): Promise<void> {
    const inputs = await page
      .locator('input:visible:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea:visible')
      .all()

    for (const input of inputs) {
      try {
        const current = await input.inputValue({ timeout: 1_500 }).catch(() => '')
        if (current) continue
        const attr = async (name: string) =>
          (await input.getAttribute(name, { timeout: 1_500 }).catch(() => '')) ?? ''
        const name = `${await attr('name')} ${await attr('id')} ${await attr('placeholder')} ${await attr('data-testid')}`.toLowerCase()
        const type = (await attr('type')) || 'text'
        await input.fill(this.valueForInput(name, type), { timeout: CLICK_TIMEOUT_MS })
      } catch {
        // skip unfillable input
      }
    }
  }

  private valueForInput(hint: string, type: string): string {
    if (/post\s*code|postal|zip/.test(hint)) return 'SW1A 1AA'
    if (/email/.test(hint) || type === 'email') return 'qa.user@example.com'
    if (/phone|mobile|tel/.test(hint) || type === 'tel') return '+447700900123'
    if (/name/.test(hint)) return 'Ada Lovelace'
    if (/city|town/.test(hint)) return 'London'
    if (/address|street|line1/.test(hint)) return '10 Downing Street'
    if (type === 'number' || /price|amount|qty|quantity|number/.test(hint)) return '2'
    if (type === 'date') return '2026-01-01'
    return 'QA Test'
  }

  /** Select the first option in each radio group and click the first option-like card. */
  private async pickFirstOptions(page: Page): Promise<void> {
    try {
      const radios = await page.locator('input[type="radio"]:visible').all()
      const seenGroups = new Set<string>()
      for (const radio of radios) {
        const group = (await radio.getAttribute('name')) ?? Math.random().toString()
        if (seenGroups.has(group)) continue
        seenGroups.add(group)
        await this.tryAction(radio, async () => {
          await radio.check({ timeout: CLICK_TIMEOUT_MS })
        })
      }

      const optionCard = page
        .locator('[data-testid*="option"]:visible, [data-testid*="address-option"]:visible, [data-testid*="path"]:visible, [data-testid*="card"]:visible')
        .first()
      if (await optionCard.count()) {
        const label = `${(await optionCard.textContent({ timeout: 1_500 }).catch(() => '')) ?? ''}`
        if (!SKIP_OVERLAY_ACTION_PATTERN.test(label)) {
          await this.tryAction(optionCard, async () => {
            await optionCard.click({ timeout: CLICK_TIMEOUT_MS })
          })
        }
      }
    } catch {
      // best effort
    }
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

  private async exploreComboboxes(
    page: Page,
    lines: string[],
    recordElements: (elements: ElementInfo[]) => void,
    onSkip: () => void,
  ): Promise<void> {
    const comboboxes = page.locator('[role="combobox"]:visible, [aria-haspopup="listbox"]:visible')
    const count = await comboboxes.count()

    for (let i = 0; i < count; i++) {
      const combobox = comboboxes.nth(i)
      const tagName = await combobox.evaluate((el) => el.tagName).catch(() => '')
      if (tagName.toUpperCase() === 'SELECT') continue

      const selector = await this.resolveSelector(combobox)
      if (!selector) {
        onSkip()
        continue
      }

      const opened = await this.tryAction(combobox, async () => {
        await combobox.click({ timeout: CLICK_TIMEOUT_MS })
      })
      if (!opened) {
        onSkip()
        continue
      }

      lines.push(`await page.locator(${JSON.stringify(selector)}).click();`)

      const listbox = page.locator('[role="listbox"]:visible').first()
      const hasListbox = await listbox.isVisible().catch(() => false)
      if (!hasListbox) continue

      const panelElements = await scanPageElements(page, {
        scope: listbox,
        surfaceContext: 'dropdownPanel',
      })
      recordElements(panelElements)

      const options = listbox.locator('[role="option"]:visible')
      const optionCount = await options.count()
      if (optionCount > 0) {
        const firstOption = options.first()
        const optionSelector = await this.resolveSelector(firstOption)
        if (optionSelector) {
          const line = `await page.locator(${JSON.stringify(optionSelector)}).click();`
          const ok = await this.tryAction(firstOption, async () => {
            await firstOption.click({ timeout: CLICK_TIMEOUT_MS })
          })
          if (ok) lines.push(line)
        }
      }

      await page.keyboard.press('Escape').catch(() => undefined)
      await page.waitForTimeout(100)
    }
  }

  private async exploreButtons(
    page: Page,
    lines: string[],
    recordElements: (elements: ElementInfo[]) => void,
    onSkip: () => void,
  ): Promise<void> {
    const buttons = await page.locator('button:visible, [role="button"]:visible').all()

    for (const button of buttons) {
      const label = await this.readLabel(button)
      if (SKIP_BUTTON_PATTERN.test(label) || SKIP_EXPLORE_BUTTON.test(label)) {
        onSkip()
        continue
      }

      const selector = await this.resolveSelector(button)
      if (!selector) {
        onSkip()
        continue
      }

      // Explore clicks are for element discovery only — do not record them into
      // codegen-raw (that polluted the first generated test). Still click lightly
      // so overlays / secondary surfaces can be scanned.
      const ok = await this.tryAction(button, async () => {
        await button.click({ timeout: CLICK_TIMEOUT_MS })
      })
      if (!ok) {
        onSkip()
        continue
      }

      void lines
      await this.captureOverlaySurfaces(page, lines, recordElements, onSkip)
    }
  }

  private async captureOverlaySurfaces(
    page: Page,
    lines: string[],
    recordElements: (elements: ElementInfo[]) => void,
    onSkip: () => void,
  ): Promise<void> {
    await page.waitForTimeout(200)
    const overlays = await findOpenOverlays(page)
    if (overlays.length === 0) return

    for (const overlay of overlays) {
      const panelElements = await scanPageElements(page, {
        scope: overlay.locator,
        surfaceContext: overlay.contextName,
      })
      recordElements(panelElements)

      const interactive = overlay.locator.locator(
        'button:visible, [role="button"]:visible, a[href]:visible, [role="option"]:visible, input:visible, select:visible, textarea:visible',
      )
      const count = await interactive.count()

      for (let i = 0; i < count; i++) {
        const target = interactive.nth(i)
        const label = `${(await target.textContent({ timeout: 2_000 }).catch(() => '')) ?? ''} ${(await target.getAttribute('aria-label', { timeout: 2_000 }).catch(() => '')) ?? ''}`
        if (SKIP_OVERLAY_ACTION_PATTERN.test(label)) continue

        const selector = await this.resolveSelector(target)
        if (!selector) continue

        const actionLine = `await page.locator(${JSON.stringify(selector)}).click();`
        const clicked = await this.tryAction(target, async () => {
          await target.click({ timeout: CLICK_TIMEOUT_MS })
        })
        if (clicked) lines.push(actionLine)
        else onSkip()
      }

      await dismissOverlay(page, overlay.locator)
      await page.waitForTimeout(100)
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

      let kind: ElementInfo['kind'] = 'unknown'
      if (tag === 'button' || role === 'button') kind = 'button'
      else if (tag === 'a') kind = 'link'
      else if (tag === 'select' || role === 'combobox') kind = 'select'
      else if (role === 'option' || role === 'menuitem') kind = 'button'

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
