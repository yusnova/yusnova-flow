import * as fs from 'node:fs'
import * as path from 'node:path'
import { type Locator, type Page } from '@playwright/test'
import { createAuthenticatedPage } from '@codegen-agent/dom/browser-session'
import { dismissOverlay, findOpenOverlays } from '@codegen-agent/dom/overlay-utils'
import { attachAnomalyListeners, countBrokenImages, RawAnomaly, scanVisibleErrorText } from './detectors'
import { buildMarkdownReport } from './report-writer'
import { Anomaly, ExplorationOptions, ExplorationReport } from './types'

const CLICK_TIMEOUT_MS = 5_000
const SKIP_ACTION_PATTERN = /logout|sign\s*out|delete|remove|cancel order|purchase|pay now|confirm delete|unsubscribe/i
const MAX_LINKS_PER_PAGE = 40

let anomalySeq = 0
function nextAnomalyId(): string {
  anomalySeq += 1
  return `ANOM-${Date.now()}-${anomalySeq}`
}

/**
 * Autonomous exploration ("bug-hunter") agent: crawls an app breadth-first,
 * clicking through interactive controls, and flags anomalies (JS errors,
 * failed network calls, visible error text, broken images) WITHOUT needing
 * any pre-written test cases or acceptance criteria. This is exploratory
 * QA, not verification — it complements the STLC pipeline's scripted tests
 * rather than replacing them.
 */
export class BugHunterAgent {
  async explore(opts: ExplorationOptions): Promise<ExplorationReport> {
    const runId = opts.runId ?? `explore-${Date.now()}`
    const runDir = path.join(opts.outputDir, runId)
    const screenshotsDir = path.join(runDir, 'screenshots')
    fs.mkdirSync(screenshotsDir, { recursive: true })

    const anomalies: Anomaly[] = []
    const pagesVisited: string[] = []
    const visitedUrls = new Set<string>()
    let actionsPerformed = 0
    let actionTrail: string[] = []

    const { browser, page } = await createAuthenticatedPage({
      url: opts.url,
      headless: opts.headless,
      ...(opts.storageState ? { storageState: opts.storageState } : {}),
    })

    const recordAnomaly = async (partial: RawAnomaly): Promise<void> => {
      const id = nextAnomalyId()
      let screenshotPath: string | undefined
      try {
        const file = path.join(screenshotsDir, `${id}.png`)
        await page.screenshot({ path: file, timeout: 5_000 })
        screenshotPath = file
      } catch {
        screenshotPath = undefined
      }

      anomalies.push({
        ...partial,
        id,
        timestamp: new Date().toISOString(),
        actionTrail: [...actionTrail],
        ...(screenshotPath ? { screenshotPath } : {}),
      })
    }

    const detach = attachAnomalyListeners(page, (raw) => {
      void recordAnomaly(raw)
    })

    try {
      const startOrigin = new URL(opts.url).origin
      const queue: string[] = [opts.url]

      while (queue.length > 0 && pagesVisited.length < opts.maxPages) {
        const targetUrl = queue.shift()!
        if (visitedUrls.has(targetUrl)) continue
        visitedUrls.add(targetUrl)

        const navigated = await this.safeGoto(page, targetUrl, recordAnomaly)
        if (!navigated) continue

        pagesVisited.push(page.url())
        actionTrail = [`goto ${targetUrl}`]

        await this.scanCurrentPage(page, recordAnomaly)

        const discoveredLinks = await this.exploreActions(page, opts, recordAnomaly, (line) => {
          actionTrail.push(line)
          actionsPerformed += 1
        })

        for (const link of discoveredLinks) {
          if (visitedUrls.has(link)) continue
          if (opts.sameOriginOnly && this.originOf(link) !== startOrigin) continue
          queue.push(link)
        }
      }
    } finally {
      detach()
      await page.context().close().catch(() => undefined)
      await browser.close().catch(() => undefined)
    }

    const jsonPath = path.join(runDir, 'anomalies.json')
    fs.writeFileSync(jsonPath, JSON.stringify(anomalies, null, 2), 'utf-8')

    const reportPath = path.join(runDir, 'exploration-report.md')
    if (!opts.skipMarkdownReport) {
      fs.writeFileSync(
        reportPath,
        buildMarkdownReport({ runId, startUrl: opts.url, pagesVisited, actionsPerformed, anomalies }),
        'utf-8',
      )
    }

    return { runId, startUrl: opts.url, pagesVisited, actionsPerformed, anomalies, outputDir: runDir, reportPath, jsonPath, screenshotsDir }
  }

  private originOf(href: string): string {
    try {
      return new URL(href).origin
    } catch {
      return ''
    }
  }

  private async safeGoto(page: Page, targetUrl: string, recordAnomaly: (a: RawAnomaly) => Promise<void>): Promise<boolean> {
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      return true
    } catch (error) {
      await recordAnomaly({
        type: 'navigation_failure',
        severity: 'major',
        pageUrl: targetUrl,
        description: 'Failed to navigate to page',
        evidence: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  private async scanCurrentPage(page: Page, recordAnomaly: (a: RawAnomaly) => Promise<void>): Promise<void> {
    for (const finding of await scanVisibleErrorText(page)) {
      await recordAnomaly(finding)
    }

    const brokenImages = await countBrokenImages(page)
    if (brokenImages > 0) {
      await recordAnomaly({
        type: 'broken_image',
        severity: 'minor',
        pageUrl: page.url(),
        description: `${brokenImages} broken image(s) detected`,
        evidence: `naturalWidth=0 on ${brokenImages} <img> element(s) after load`,
      })
    }
  }

  private async exploreActions(
    page: Page,
    opts: ExplorationOptions,
    recordAnomaly: (a: RawAnomaly) => Promise<void>,
    onAction: (line: string) => void,
  ): Promise<string[]> {
    const startUrl = page.url()
    const discoveredLinks = await this.collectLinks(page, startUrl)

    const buttons = page.locator('button:visible, [role="button"]:visible')
    const buttonCount = await buttons.count()
    const actionBudget = Math.min(buttonCount, opts.maxActionsPerPage)

    for (let i = 0; i < actionBudget; i++) {
      const button = buttons.nth(i)
      const label = ((await button.textContent().catch(() => '')) ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
      if (SKIP_ACTION_PATTERN.test(label)) continue

      const clicked = await this.tryClick(button)
      if (!clicked) continue

      onAction(`click "${label || '(unlabeled button)'}"`)
      await page.waitForTimeout(300)

      await this.scanCurrentPage(page, recordAnomaly)
      await this.closeAnyOverlay(page)

      if (page.url() !== startUrl) {
        await page
          .goBack({ timeout: CLICK_TIMEOUT_MS })
          .catch(() => page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => undefined))
        await page.waitForLoadState('domcontentloaded').catch(() => undefined)
      }
    }

    return discoveredLinks
  }

  private async collectLinks(page: Page, baseUrl: string): Promise<string[]> {
    const links = page.locator('a[href]')
    const count = await links.count()
    const discovered: string[] = []

    for (let i = 0; i < Math.min(count, MAX_LINKS_PER_PAGE); i++) {
      const href = await links.nth(i).getAttribute('href').catch(() => null)
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue
      try {
        discovered.push(new URL(href, baseUrl).toString())
      } catch {
        continue
      }
    }

    return discovered
  }

  private async closeAnyOverlay(page: Page): Promise<void> {
    const overlays = await findOpenOverlays(page).catch(() => [])
    for (const overlay of overlays) {
      await dismissOverlay(page, overlay.locator).catch(() => undefined)
    }
  }

  private async tryClick(locator: Locator): Promise<boolean> {
    try {
      if (!(await locator.isVisible())) return false
      await locator.click({ timeout: CLICK_TIMEOUT_MS })
      return true
    } catch {
      return false
    }
  }
}
