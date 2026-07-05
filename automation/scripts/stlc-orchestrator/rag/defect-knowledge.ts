import * as fs from 'node:fs'
import * as path from 'node:path'
import { DefectRecord } from '../types'

export interface DefectPattern {
  id: string
  module: string
  requirementKeywords: string[]
  symptom: string
  rootCause: string
  missedBecause: string
  severity: DefectRecord['severity']
  sourceRunId?: string
  createdAt: string
}

export interface RagMatch {
  pattern: DefectPattern
  score: number
  reason: string
}

const DEFAULT_KNOWLEDGE_DIR = path.resolve(__dirname, '..', '..', '..', 'tmp/stlc/knowledge')

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
}

function scoreOverlap(queryTokens: string[], pattern: DefectPattern): number {
  const haystack = tokenize(
    [pattern.module, pattern.symptom, pattern.rootCause, ...pattern.requirementKeywords].join(' '),
  )
  if (haystack.length === 0 || queryTokens.length === 0) return 0

  const hits = queryTokens.filter((token) => haystack.includes(token)).length
  return hits / queryTokens.length
}

export class DefectKnowledgeBase {
  constructor(private readonly knowledgeDir = DEFAULT_KNOWLEDGE_DIR) {}

  private filePath(): string {
    return path.join(this.knowledgeDir, 'defect-patterns.json')
  }

  load(): DefectPattern[] {
    const file = this.filePath()
    if (!fs.existsSync(file)) {
      const seed = path.join(this.knowledgeDir, 'defect-patterns.seed.json')
      if (fs.existsSync(seed)) {
        const patterns = JSON.parse(fs.readFileSync(seed, 'utf-8')) as DefectPattern[]
        this.save(patterns)
        return patterns
      }
      return []
    }
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as DefectPattern[]
  }

  save(patterns: DefectPattern[]): void {
    fs.mkdirSync(this.knowledgeDir, { recursive: true })
    fs.writeFileSync(this.filePath(), JSON.stringify(patterns, null, 2), 'utf-8')
  }

  ingestFromDefects(defects: DefectRecord[], module: string, runId: string): DefectPattern[] {
    const existing = this.load()
    const added: DefectPattern[] = defects.map((defect, index) => ({
      id: `PAT-${runId.slice(0, 8)}-${index + 1}`,
      module,
      requirementKeywords: tokenize(defect.title),
      symptom: defect.title,
      rootCause: defect.rootCauseHypothesis ?? 'Unknown',
      missedBecause: 'Requirement ambiguity or missing negative coverage',
      severity: defect.severity,
      sourceRunId: runId,
      createdAt: new Date().toISOString(),
    }))

    const merged = [...existing]
    for (const pattern of added) {
      const duplicate = merged.find(
        (entry) => entry.symptom.toLowerCase() === pattern.symptom.toLowerCase(),
      )
      if (!duplicate) merged.push(pattern)
    }

    this.save(merged)
    return added
  }

  search(requirementText: string, module: string, limit = 5): RagMatch[] {
    const queryTokens = tokenize(requirementText)
    const patterns = this.load().filter(
      (pattern) => pattern.module === module || pattern.module === 'global',
    )

    return patterns
      .map((pattern) => {
        const score = scoreOverlap(queryTokens, pattern)
        return {
          pattern,
          score,
          reason: score > 0
            ? `Keyword overlap with historical defect: ${pattern.symptom}`
            : 'Low relevance',
        }
      })
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}

export function formatRagContext(matches: RagMatch[]): string {
  if (matches.length === 0) return 'No historical defect patterns matched.'
  return matches
    .map(
      (match, index) =>
        `${index + 1}. [${match.pattern.severity}] ${match.pattern.symptom} — root: ${match.pattern.rootCause}; missed because: ${match.pattern.missedBecause} (score ${match.score.toFixed(2)})`,
    )
    .join('\n')
}
