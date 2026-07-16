export function normalizePageName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed

  if (/^[A-Z][A-Za-z0-9]*$/.test(trimmed)) {
    return trimmed.endsWith('Page') ? trimmed : `${trimmed}Page`
  }

  const words = trimmed
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
    .filter((word) => word !== 'page')

  const base = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')
  if (!base) return 'Page'

  return base.endsWith('Page') ? base : `${base}Page`
}

/** InventoryPage → inventoryPage (fixture / spec variable name) */
export function toPageVar(className: string): string {
  const stem = className.endsWith('Page') ? className.slice(0, -4) : className
  return `${stem.charAt(0).toLowerCase()}${stem.slice(1)}Page`
}

/** InventoryPage → inventory-page.ts */
export function toPageFileName(className: string): string {
  const stem = className.endsWith('Page') ? className.slice(0, -4) : className
  const kebab = stem
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
  return `${kebab}-page.ts`
}

export function toPageImportPath(className: string): string {
  return toPageFileName(className).replace(/\.ts$/, '')
}

/** inventory → InventoryFixtures */
export function toFixtureInterfaceName(domain: string): string {
  return `${domain
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}Fixtures`
}

export function validatePageNameInput(value: string): string | undefined {
  if (!value.trim()) return undefined
  if (!/[a-zA-Z0-9]/.test(value)) {
    return 'Enter a page name with letters or numbers (e.g. example-page, ExamplePage)'
  }
  return undefined
}
