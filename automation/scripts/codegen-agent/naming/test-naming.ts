const NOISE_WORDS = new Set([
  'verify',
  'that',
  'the',
  'for',
  'and',
  'with',
  'from',
  'page',
  'regression',
  'smoke',
  'unstable',
  'area',
  'ac',
])

const INTERNAL_TITLE_PATTERN =
  /\b(TC-CB-\d+|regression smoke|codebase-scanner|design-agent|planning-agent|spec-writer|spec-merge|\.ts|\.tsx)\b/i

const MAX_TEST_NAME_LENGTH = 80

export function cleanVerifyTitle(raw: string): string {
  let title = raw
    .replace(/^\[TC-CB-\d+\]\s*/i, '')
    .replace(/^Verify AC:\s*/i, '')
    .replace(/^Verify\s+/i, '')
    .replace(/\s+in\s+[\w.-]+\.(ts|tsx|js|jsx)\b/gi, '')
    .replace(/\.(ts|tsx|js|jsx)\b/gi, '')
    .replace(/\bRegression smoke for unstable area\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (!title || looksLikeInternalDesignedTitle(title)) {
    return 'the page handles unexpected input without breaking'
  }
  if (!/^the\b/i.test(title)) title = `the ${title}`
  return title
}

function toPascalCaseWords(words: string[]): string {
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

export function toTestName(title: string): string {
  const phrase = cleanVerifyTitle(title).replace(/^the\s+/i, '')
  const words = phrase
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !NOISE_WORDS.has(word.toLowerCase()))

  if (words.length === 0) return 'GeneratedCase'

  let trimmed = [...words]
  while (trimmed.length > 1 && toPascalCaseWords(trimmed).length > MAX_TEST_NAME_LENGTH) {
    trimmed.pop()
  }

  return toPascalCaseWords(trimmed)
}

export function looksLikeInternalDesignedTitle(title: string): boolean {
  return INTERNAL_TITLE_PATTERN.test(title)
}
