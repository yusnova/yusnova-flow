/**
 * Robust acceptance-criteria parser.
 *
 * The previous heuristic only matched lines that literally started with
 * `AC:` / `Given` / `- ` on their own line. Real requirements arrive in many
 * shapes: a single-line blob with `AC1:`/`AC-1`/`1.` markers, semicolon or
 * `. ` separated sentences, or free prose. This module normalises all of those
 * into discrete, deduplicated acceptance-criteria strings so downstream design
 * always has structured input — no LLM required.
 */

/** Inline markers that delimit distinct criteria inside one blob. */
const AC_MARKER = /\b(?:AC|Acceptance(?:\s+Criteria)?|Criteria)\s*[-#]?\s*\d*\s*[:.)-]/gi
const NUMBERED_MARKER = /(?:^|\s)(?:\d{1,2})\s*[.)]\s+/g
const GIVEN_WHEN_THEN = /\b(?:Given|When|Then|And)\b\s+/gi

const SENTENCE_SPLIT = /(?<=[.!?;])\s+(?=[A-ZÇĞİÖŞÜ])/
const BULLET_LINE = /^\s*(?:[-*•]|\d{1,2}\s*[.)])\s+/

/** Filler that shouldn't survive as its own criterion. */
const NOISE = /^(?:and|then|also|note|e\.?g\.?|i\.?e\.?)[:\s]*$/i

function clean(fragment: string): string {
  return fragment
    .replace(/^\s*(?:[-*•]\s*)+/, '')
    .replace(/^\s*(?:AC|Acceptance(?:\s+Criteria)?|Criteria)\s*[-#]?\s*\d*\s*[:.)-]\s*/i, '')
    .replace(/^\s*\d{1,2}\s*[.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/[;,.]\s*$/, '')
    .trim()
}

function isMeaningful(fragment: string): boolean {
  if (fragment.length < 6) return false
  if (NOISE.test(fragment)) return false
  // must contain at least two word-ish tokens
  return fragment.split(/\s+/).filter((w) => w.length > 1).length >= 2
}

/** Split a single line that contains multiple inline `AC`/numbered markers. */
function splitInlineMarkers(line: string): string[] {
  const markerCount =
    (line.match(AC_MARKER)?.length ?? 0) + (line.match(NUMBERED_MARKER)?.length ?? 0)

  if (markerCount >= 2) {
    // Insert a hard break before each marker, then split on it.
    const withBreaks = line
      .replace(AC_MARKER, (m) => `\u0000${m}`)
      .replace(NUMBERED_MARKER, (m) => `\u0000${m}`)
    return withBreaks.split('\u0000')
  }

  return [line]
}

/** Split a fragment that packs several Given/When/Then clauses on one line. */
function splitGwt(fragment: string): string[] {
  const gwtCount = fragment.match(GIVEN_WHEN_THEN)?.length ?? 0
  if (gwtCount >= 2) {
    return fragment
      .replace(GIVEN_WHEN_THEN, (m) => `\u0000${m}`)
      .split('\u0000')
      .filter(Boolean)
  }
  return [fragment]
}

export interface ParsedAc {
  text: string
  /** How the criterion was recovered — useful for audit/debugging. */
  origin: 'marker' | 'bullet' | 'sentence' | 'line'
}

export function parseAcceptanceCriteria(raw: string): ParsedAc[] {
  const text = (raw ?? '').trim()
  if (!text) return []

  const results: ParsedAc[] = []
  const seen = new Set<string>()

  const push = (fragment: string, origin: ParsedAc['origin']) => {
    const cleaned = clean(fragment)
    if (!isMeaningful(cleaned)) return
    const key = cleaned.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    results.push({ text: cleaned, origin })
  }

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    const isBullet = BULLET_LINE.test(line)

    // 1) Explicit inline markers (AC1: ... AC2: ... or 1. ... 2. ...)
    const markerParts = splitInlineMarkers(line)
    if (markerParts.length > 1) {
      for (const part of markerParts) {
        for (const gwt of splitGwt(part)) push(gwt, 'marker')
      }
      continue
    }

    // 2) Bullet / numbered single line
    if (isBullet) {
      for (const gwt of splitGwt(line)) push(gwt, 'bullet')
      continue
    }

    // 3) Given/When/Then packed on one line
    const gwtParts = splitGwt(line)
    if (gwtParts.length > 1) {
      for (const part of gwtParts) push(part, 'marker')
      continue
    }

    // 4) Fall back to sentence splitting for prose blobs
    const sentences = line.split(SENTENCE_SPLIT)
    if (sentences.length > 1) {
      for (const sentence of sentences) push(sentence, 'sentence')
      continue
    }

    push(line, 'line')
  }

  return results
}
