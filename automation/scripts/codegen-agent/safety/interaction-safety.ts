export type LinkTargetKind = 'same-page' | 'internal-nav' | 'external'

/**
 * Mirrors page-explorer.ts's isExternalHref, but also distinguishes same-page
 * (self-referencing / hash-only) links from links that navigate to a
 * different in-app path, so callers can pick the right assertion strategy.
 */
export function classifyLinkTarget(href: string, pageUrl: string): LinkTargetKind {
  if (!href || href.startsWith('#')) return 'same-page'

  try {
    const resolved = new URL(href, pageUrl)
    const current = new URL(pageUrl)
    if (resolved.origin !== current.origin) return 'external'
    if (resolved.pathname === current.pathname) return 'same-page'
    return 'internal-nav'
  } catch {
    return 'same-page'
  }
}

const DESTRUCTIVE_LABEL_PATTERN = /delete|remove|logout|sign[\s-]?out|purchase|pay|confirm order|unsubscribe/i

/** Same intent as page-explorer.ts's SKIP_OVERLAY_ACTION_PATTERN — avoid auto-generating clicks on irreversible actions. */
export function isDestructiveLabel(text: string): boolean {
  return DESTRUCTIVE_LABEL_PATTERN.test(text)
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
