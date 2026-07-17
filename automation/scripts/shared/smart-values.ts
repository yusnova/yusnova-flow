/**
 * Heuristic "realistic value" generator shared by the API generator and the
 * design agent. Maps a field's name + inferred primitive type to a plausible
 * valid value, so generated positive tests exercise real behaviour instead of
 * sending `"test value"` everywhere.
 */

export type PrimitiveType = 'string' | 'number' | 'boolean' | 'unknown'

interface Dictionary {
  match: RegExp
  value: () => string | number | boolean
}

const NAME_DICTIONARY: Dictionary[] = [
  { match: /post\s*code|postal|zip/i, value: () => 'SW1A 1AA' },
  { match: /skip\s*size|size/i, value: () => '4-yard' },
  { match: /price|amount|cost|total/i, value: () => 120 },
  { match: /email/i, value: () => 'qa.user@example.com' },
  { match: /password/i, value: () => 'Test@Password123!' },
  { match: /phone|mobile|tel/i, value: () => '+447700900123' },
  { match: /first\s*name/i, value: () => 'Ada' },
  { match: /last\s*name|surname/i, value: () => 'Lovelace' },
  { match: /user\s*name|login/i, value: () => 'qa_user' },
  { match: /city|town/i, value: () => 'London' },
  { match: /country/i, value: () => 'United Kingdom' },
  { match: /address|line1|street/i, value: () => '10 Downing Street' },
  { match: /quantity|count|qty|num/i, value: () => 2 },
  { match: /date/i, value: () => '2026-01-01' },
  { match: /id$/i, value: () => 'addr_1' },
  { match: /heavy|plasterboard|enabled|active|agree|consent/i, value: () => true },
]

export function smartValue(fieldName: string, type: PrimitiveType): string | number | boolean {
  for (const entry of NAME_DICTIONARY) {
    if (entry.match.test(fieldName)) {
      const v = entry.value()
      // respect an explicit primitive type when the name-based guess conflicts
      if (type === 'number' && typeof v !== 'number') return 1
      if (type === 'boolean' && typeof v !== 'boolean') return true
      if (type === 'string' && typeof v !== 'string') return String(v)
      return v
    }
  }
  switch (type) {
    case 'number':
      return 1
    case 'boolean':
      return true
    default:
      return 'test'
  }
}

/** A value of the WRONG primitive type — used for negative/validation tests. */
export function wrongTypeValue(type: PrimitiveType): string | number | boolean {
  switch (type) {
    case 'number':
      return 'not-a-number'
    case 'boolean':
      return 'not-a-boolean'
    case 'string':
      return 12345
    default:
      return null as unknown as string
  }
}
