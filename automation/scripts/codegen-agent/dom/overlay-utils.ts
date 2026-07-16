import { type Locator, type Page } from '@playwright/test'

export interface OpenOverlay {
  locator: Locator
  contextName: string
}

const OVERLAY_ROOT_SELECTORS = [
  '[role="dialog"]:visible',
  '[role="alertdialog"]:visible',
  '[aria-modal="true"]:visible',
]

const CLOSE_BUTTON_PATTERNS = [
  /close/i,
  /cancel/i,
  /dismiss/i,
  /×/,
]

export async function findOpenOverlays(page: Page): Promise<OpenOverlay[]> {
  const overlays: OpenOverlay[] = []

  for (const selector of OVERLAY_ROOT_SELECTORS) {
    const roots = page.locator(selector)
    const count = await roots.count()

    for (let i = 0; i < count; i++) {
      const locator = roots.nth(i)
      if (!(await locator.isVisible().catch(() => false))) continue

      const contextName = await deriveOverlayContextName(locator)
      overlays.push({ locator, contextName })
    }
  }

  return dedupeOverlays(overlays)
}

export async function dismissOverlay(page: Page, overlay?: Locator): Promise<boolean> {
  if (overlay) {
    const closed = await clickOverlayCloseButton(overlay)
    if (closed) {
      await waitForOverlayHidden(page, overlay)
      return true
    }
  }

  await page.keyboard.press('Escape').catch(() => undefined)
  await page.waitForTimeout(150)

  if (overlay && (await overlay.isVisible().catch(() => false))) {
    const backdrop = page.locator('[data-testid="backdrop"], .modal-backdrop, [class*="backdrop"]').first()
    if (await backdrop.isVisible().catch(() => false)) {
      await backdrop.click({ position: { x: 2, y: 2 }, timeout: 2_000 }).catch(() => undefined)
    }
  }

  if (overlay) {
    await waitForOverlayHidden(page, overlay)
    return !(await overlay.isVisible().catch(() => false))
  }

  const remaining = await findOpenOverlays(page)
  return remaining.length === 0
}

async function clickOverlayCloseButton(overlay: Locator): Promise<boolean> {
  const candidates = overlay.locator(
    'button:visible, [role="button"]:visible, [aria-label*="close" i]:visible, [data-test*="close" i]:visible',
  )
  const count = await candidates.count()

  for (let i = 0; i < count; i++) {
    const candidate = candidates.nth(i)
    const label = `${(await candidate.textContent()) ?? ''} ${(await candidate.getAttribute('aria-label')) ?? ''}`
    if (!CLOSE_BUTTON_PATTERNS.some((pattern) => pattern.test(label))) continue

    try {
      await candidate.click({ timeout: 2_000 })
      return true
    } catch {
      continue
    }
  }

  return false
}

async function waitForOverlayHidden(page: Page, overlay: Locator): Promise<void> {
  await overlay.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined)
  await page.waitForTimeout(100)
}

async function deriveOverlayContextName(overlay: Locator): Promise<string> {
  return overlay.evaluate((node) => {
    const element = node as HTMLElement
    const ariaLabel = element.getAttribute('aria-label')?.trim()
    if (ariaLabel) return wordsToCamel(ariaLabel)

    const labelledBy = element.getAttribute('aria-labelledby')
    if (labelledBy) {
      const labelNode = document.getElementById(labelledBy)
      const text = labelNode?.textContent?.trim()
      if (text) return `${wordsToCamel(text)}Dialog`
    }

    const heading = element.querySelector('h1, h2, h3, [role="heading"]')
    const headingText = heading?.textContent?.trim()
    if (headingText) return `${wordsToCamel(headingText)}Dialog`

    const dataTest =
      element.getAttribute('data-testid')
      ?? element.getAttribute('data-test')
      ?? element.getAttribute('data-test-id')
    if (dataTest) return wordsToCamel(dataTest.replace(/-modal|-dialog|-popup/gi, ''))

    const role = element.getAttribute('role') ?? 'dialog'
    return role === 'alertdialog' ? 'alertDialog' : 'modalDialog'
  })
}

function dedupeOverlays(overlays: OpenOverlay[]): OpenOverlay[] {
  const seen = new Set<string>()
  return overlays.filter((overlay) => {
    const key = overlay.contextName
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function wordsToCamel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('')
}
