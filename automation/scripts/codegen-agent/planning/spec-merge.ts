export const STLC_GENERATED_MARKER = '@stlc:generated'
export const STLC_MANUAL_MARKER = '@stlc:manual'
const PRESERVED_SECTION_TITLE = "[Manual] Preserved tests"

export function tagGeneratedSpec(content: string): string {
  return content.replace(
    /^(\s*)test(\.fixme)?\(/gm,
    `$1// ${STLC_GENERATED_MARKER}\n$1test$2(`,
  )
}

function isGeneratedTestLine(lines: string[], testLineIndex: number): boolean {
  for (let i = testLineIndex - 1; i >= 0; i -= 1) {
    const trimmed = lines[i]!.trim()
    if (trimmed.length === 0) continue
    if (trimmed.includes(STLC_MANUAL_MARKER)) return false
    if (trimmed.includes(STLC_GENERATED_MARKER)) return true
    return false
  }
  return false
}

function extractTestBlock(lines: string[], start: number): { text: string; endIndex: number } | null {
  const blockLines = [lines[start]!]
  let parenDepth = 0
  let braceDepth = 0
  let started = false

  for (let i = start; i < lines.length; i += 1) {
    const line = i === start ? lines[i]! : lines[i]!
    if (i > start) blockLines.push(line)

    for (const char of line) {
      if (char === '(') {
        parenDepth += 1
        started = true
      } else if (char === ')') {
        parenDepth -= 1
      } else if (char === '{') {
        braceDepth += 1
      } else if (char === '}') {
        braceDepth -= 1
      }
    }

    if (started && parenDepth <= 0 && braceDepth <= 0 && /\}\);?\s*$/.test(line.trim())) {
      return { text: blockLines.join('\n'), endIndex: i }
    }
  }

  return null
}

function stripPreviousPreservedSection(content: string): string {
  const marker = `test.describe('${PRESERVED_SECTION_TITLE}'`
  const idx = content.lastIndexOf(marker)
  if (idx === -1) return content
  return content.slice(0, idx).trimEnd()
}

export function extractManualSpecBlocks(content: string): string[] {
  const source = stripPreviousPreservedSection(content)
  return collectManualTests(source.split('\n'))
}

function collectManualTests(lines: string[]): string[] {
  const blocks: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (/^\s*test\.describe\(/.test(line)) {
      const block = extractTestBlock(lines, i)
      if (!block) continue
      const innerLines = block.text.split('\n').slice(1, -1)
      blocks.push(...collectManualTests(innerLines))
      i = block.endIndex
      continue
    }

    if (!/^\s*test(?:\.fixme)?\(/.test(line)) continue

    const block = extractTestBlock(lines, i)
    if (!block) continue

    if (!isGeneratedTestLine(lines, i)) {
      blocks.push(block.text)
    }

    i = block.endIndex
  }

  return blocks.filter((block) => block.trim().length > 0)
}

export function mergeSpecPreservingManual(existingContent: string, generatedContent: string): string {
  const manualBlocks = extractManualSpecBlocks(existingContent)
  if (manualBlocks.length === 0) return generatedContent

  const trimmedGenerated = generatedContent.trimEnd()
  const manualSection = [
    '',
    `test.describe('${PRESERVED_SECTION_TITLE}', () => {`,
    ...manualBlocks.map((block) => indentBlock(block, 2)),
    '})',
    '',
  ].join('\n')

  return `${trimmedGenerated}\n${manualSection}`
}

function indentBlock(block: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return block
    .split('\n')
    .map((line) => (line.trim().length === 0 ? line : `${pad}${line}`))
    .join('\n')
}

export function isManualSpecLine(content: string, lineNumber: number): boolean {
  const lines = content.split('\n')
  const index = lineNumber - 1
  if (index < 0 || index >= lines.length) return true

  for (let i = index; i >= Math.max(0, index - 15); i -= 1) {
    if (lines[i]!.includes(STLC_MANUAL_MARKER)) return true
    if (lines[i]!.includes(STLC_GENERATED_MARKER)) return false
  }

  return true
}
