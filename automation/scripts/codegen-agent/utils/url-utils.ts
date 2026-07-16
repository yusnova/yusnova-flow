import { configEnv } from '@bootstrap/config'

function knownBaseOrigins(): string[] {
  try {
    return [new URL(configEnv.baseURL).origin]
  } catch {
    return []
  }
}

/**
 * Playwright resolves relative goto paths against playwright.config.ts's `baseURL`
 * (fixed to the "demo" env at execution time). Only strip the origin when the
 * target actually lives on that configured base — otherwise a relative path would
 * silently navigate to the wrong site (e.g. codegen against an unrelated external
 * URL), so the absolute URL is kept instead.
 */
export function gotoPathFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (knownBaseOrigins().includes(parsed.origin)) {
      return parsed.pathname + parsed.search
    }
    return url
  } catch {
    return url
  }
}
