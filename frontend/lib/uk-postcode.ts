const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i

export function isValidUkPostcode(input: string): boolean {
  const t = input.trim()
  if (t.length < 5 || t.length > 8) return false
  return UK_POSTCODE.test(t.replace(/\s+/g, " "))
}

export function formatPostcodeDisplay(pc: string): string {
  const compact = pc.replace(/\s+/g, "").toUpperCase()
  if (compact.length < 5) return pc.trim().toUpperCase()
  const outward = compact.slice(0, -3)
  const inward = compact.slice(-3)
  return `${outward} ${inward}`
}
