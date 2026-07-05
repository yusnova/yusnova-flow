export function normalizeDomainName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed

  let normalized = trimmed
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-page$/, '')

  return normalized
}

export function validateDomainInput(value: string): string | undefined {
  if (!value.trim()) return undefined

  const normalized = normalizeDomainName(value)
  if (!normalized || !/^[a-z][a-z0-9-]*$/.test(normalized)) {
    return 'Enter a feature name with letters or numbers (e.g. inventory-page, products)'
  }

  return undefined
}

export function suggestDomainFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const segment = pathname.split('/').filter(Boolean).pop() ?? 'feature'
    return normalizeDomainName(segment.replace(/\.[a-z]+$/i, ''))
  } catch {
    return 'feature'
  }
}
