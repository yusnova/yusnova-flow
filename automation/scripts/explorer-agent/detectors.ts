import { type ConsoleMessage, type Page, type Request, type Response } from '@playwright/test'
import { AnomalySeverity, AnomalyType } from './types'

export type RawAnomaly = {
  type: AnomalyType
  severity: AnomalySeverity
  pageUrl: string
  description: string
  evidence: string
}

/**
 * Text patterns that indicate a real defect is visible in the rendered
 * page — not just "the word error appears somewhere" (too noisy), but the
 * specific signatures of unhandled backend errors, leaked stack traces, or
 * broken data binding that QA engineers scan for manually.
 */
const ERROR_TEXT_PATTERNS: Array<{ pattern: RegExp; severity: AnomalySeverity; label: string }> = [
  { pattern: /internal server error/i, severity: 'critical', label: 'Internal Server Error text visible on page' },
  { pattern: /50[0-9]\s*(internal )?(server )?error/i, severity: 'critical', label: '5xx error text visible on page' },
  {
    pattern: /(undefined is not a function|cannot read propert(y|ies) of (undefined|null)|is not defined)/i,
    severity: 'critical',
    label: 'Raw JavaScript error message rendered in the UI',
  },
  { pattern: /\[object Object\]/, severity: 'major', label: 'Unserialized object literal rendered in the UI' },
  { pattern: /\bNaN\b/, severity: 'minor', label: 'NaN rendered in the UI (likely broken calculation/formatting)' },
  { pattern: /at Object\.<anonymous>|at Module\._compile|\bstack trace\b/i, severity: 'major', label: 'Stack trace leaked to the UI' },
  { pattern: /something went wrong|unexpected error occurred/i, severity: 'major', label: 'Generic error-boundary message shown' },
  { pattern: /404[\s-]*(page )?not found/i, severity: 'major', label: '404 / not-found text visible on page' },
]

export function attachAnomalyListeners(page: Page, onAnomaly: (anomaly: RawAnomaly) => void): () => void {
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    onAnomaly({
      type: 'console_error',
      severity: 'major',
      pageUrl: page.url(),
      description: 'Browser console error',
      evidence: msg.text().slice(0, 500),
    })
  }

  const onPageError = (error: Error) => {
    onAnomaly({
      type: 'page_error',
      severity: 'critical',
      pageUrl: page.url(),
      description: 'Uncaught JavaScript exception',
      evidence: (error?.message ?? String(error)).slice(0, 500),
    })
  }

  const onResponse = (response: Response) => {
    const status = response.status()
    if (status < 400) return
    const url = response.url()
    if (/favicon|\.map$/i.test(url)) return
    onAnomaly({
      type: 'network_error',
      severity: status >= 500 ? 'critical' : 'major',
      pageUrl: page.url(),
      description: `HTTP ${status} response`,
      evidence: `${response.request().method()} ${url} → ${status}`,
    })
  }

  const onRequestFailed = (request: Request) => {
    onAnomaly({
      type: 'network_error',
      severity: 'major',
      pageUrl: page.url(),
      description: `Network request failed: ${request.failure()?.errorText ?? 'unknown reason'}`,
      evidence: `${request.method()} ${request.url()}`,
    })
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('response', onResponse)
  page.on('requestfailed', onRequestFailed)

  return () => {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('response', onResponse)
    page.off('requestfailed', onRequestFailed)
  }
}

export async function scanVisibleErrorText(page: Page): Promise<RawAnomaly[]> {
  const bodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
  if (!bodyText) return []

  const found: RawAnomaly[] = []
  for (const { pattern, severity, label } of ERROR_TEXT_PATTERNS) {
    const match = bodyText.match(pattern)
    if (!match) continue
    const idx = bodyText.indexOf(match[0])
    const context = bodyText.slice(Math.max(0, idx - 40), idx + 120).replace(/\s+/g, ' ').trim()
    found.push({
      type: 'error_text_on_page',
      severity,
      pageUrl: page.url(),
      description: label,
      evidence: context,
    })
  }
  return found
}

export async function countBrokenImages(page: Page): Promise<number> {
  return page
    .evaluate(() =>
      Array.from(document.querySelectorAll('img')).filter(
        (img) => img.src && img.complete && img.naturalWidth === 0,
      ).length,
    )
    .catch(() => 0)
}
