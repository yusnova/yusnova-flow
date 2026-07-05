export const STLC_GENERATED_MARKER = '@stlc:generated'
export const STLC_MANUAL_MARKER = '@stlc:manual'

export function tagGeneratedSpec(content: string): string {
  return content.replace(
    /^(\s*)test(\.fixme)?\(/gm,
    `$1// ${STLC_GENERATED_MARKER}\n$1test$2(`,
  )
}

export function extractManualSpecBlocks(content: string): string[] {
  const blocks: string[] = []
  const lines = content.split('\n')
  let current: string[] = []
  let inManual = false
  let depth = 0

  for (const line of lines) {
    if (line.includes(STLC_MANUAL_MARKER)) {
      inManual = true
      current = [line]
      depth = 0
      continue
    }

    if (inManual) {
      current.push(line)
      if (/test\.describe\(/.test(line)) depth += 1
      if (/^\}\)/.test(line.trim())) {
        depth -= 1
        if (depth <= 0) {
          blocks.push(current.join('\n'))
          inManual = false
          current = []
        }
      }
      continue
    }

    if (line.includes(STLC_MANUAL_MARKER) === false && /^\s*test(?:\.fixme)?\(/.test(line)) {
      const prevIdx = lines.indexOf(line) - 1
      const prev = prevIdx >= 0 ? lines[prevIdx]! : ''
      if (!prev.includes(STLC_GENERATED_MARKER)) {
        inManual = true
        current = [line]
        depth = 0
      }
    }
  }

  if (current.length > 0) blocks.push(current.join('\n'))
  return blocks.filter((block) => block.trim().length > 0)
}

export function mergeSpecPreservingManual(existingContent: string, generatedContent: string): string {
  const manualBlocks = extractManualSpecBlocks(existingContent)
  if (manualBlocks.length === 0) return generatedContent

  const trimmedGenerated = generatedContent.trimEnd()
  const manualSection = [
    '',
    `test.describe('[Manual] Preserved tests', () => {`,
    ...manualBlocks.map((block) => block.replace(/^test\.describe\(/, '  test.describe(')),
    '})',
    '',
  ].join('\n')

  return `${trimmedGenerated}\n${manualSection}`
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
