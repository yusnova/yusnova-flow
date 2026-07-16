import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { DefectRecord } from '../types'
import { cosineSimilarity, createEmbeddingProvider, EmbeddingProvider } from './embeddings'

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
const EMBEDDING_CACHE_FILE = 'defect-embeddings.json'
const SEMANTIC_MATCH_THRESHOLD = 0.15
const HYBRID_WEIGHTS = { keyword: 0.4, semantic: 0.6 } as const

interface EmbeddingCacheEntry {
  hash: string
  vector: number[]
}
type EmbeddingCache = Record<string, EmbeddingCacheEntry>

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
  constructor(
    private readonly knowledgeDir = DEFAULT_KNOWLEDGE_DIR,
    private readonly embeddingProvider: EmbeddingProvider = createEmbeddingProvider(),
  ) {}

  private filePath(): string {
    return path.join(this.knowledgeDir, 'defect-patterns.json')
  }

  private embeddingCachePath(): string {
    return path.join(this.knowledgeDir, EMBEDDING_CACHE_FILE)
  }

  private loadEmbeddingCache(): EmbeddingCache {
    const file = this.embeddingCachePath()
    if (!fs.existsSync(file)) return {}
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as EmbeddingCache
    } catch {
      return {}
    }
  }

  private saveEmbeddingCache(cache: EmbeddingCache): void {
    fs.mkdirSync(this.knowledgeDir, { recursive: true })
    fs.writeFileSync(this.embeddingCachePath(), JSON.stringify(cache, null, 2), 'utf-8')
  }

  private embeddingText(pattern: DefectPattern): string {
    return [pattern.module, pattern.symptom, pattern.rootCause, ...pattern.requirementKeywords].join(' ')
  }

  private patternHash(pattern: DefectPattern): string {
    return crypto.createHash('sha1').update(this.embeddingText(pattern)).digest('hex')
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

  private searchKeywordOnly(requirementText: string, patterns: DefectPattern[], limit: number): RagMatch[] {
    const queryTokens = tokenize(requirementText)
    return patterns
      .map((pattern) => ({
        pattern,
        score: scoreOverlap(queryTokens, pattern),
        reason: `Keyword overlap with historical defect: ${pattern.symptom}`,
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  /**
   * Hybrid dense + sparse retrieval: blends keyword overlap with cosine
   * similarity over embeddings (when STLC_LLM_API_KEY is set), so
   * paraphrased requirements can still match historical defects that share
   * no literal keywords. Falls back to pure keyword search when embeddings
   * are disabled or the embedding API call fails — never throws.
   */
  async search(requirementText: string, module: string, limit = 5): Promise<RagMatch[]> {
    const patterns = this.load().filter(
      (pattern) => pattern.module === module || pattern.module === 'global',
    )

    if (!this.embeddingProvider.isEnabled() || patterns.length === 0) {
      return this.searchKeywordOnly(requirementText, patterns, limit)
    }

    const cache = this.loadEmbeddingCache()
    const stale = patterns.filter((pattern) => cache[pattern.id]?.hash !== this.patternHash(pattern))

    let queryVector: number[] | undefined
    try {
      const [embeddedQuery, ...embeddedStale] = await this.embeddingProvider.embed([
        requirementText,
        ...stale.map((pattern) => this.embeddingText(pattern)),
      ])
      queryVector = embeddedQuery

      stale.forEach((pattern, index) => {
        const vector = embeddedStale[index]
        if (vector) cache[pattern.id] = { hash: this.patternHash(pattern), vector }
      })
      if (stale.length > 0) this.saveEmbeddingCache(cache)
    } catch {
      return this.searchKeywordOnly(requirementText, patterns, limit)
    }

    if (!queryVector) {
      return this.searchKeywordOnly(requirementText, patterns, limit)
    }

    const queryTokens = tokenize(requirementText)
    const results = patterns.map((pattern) => {
      const keywordScore = scoreOverlap(queryTokens, pattern)
      const vector = cache[pattern.id]?.vector
      const semanticScore = vector ? cosineSimilarity(queryVector!, vector) : 0
      const score = Math.max(
        keywordScore,
        HYBRID_WEIGHTS.keyword * keywordScore + HYBRID_WEIGHTS.semantic * semanticScore,
      )
      const matchKind = keywordScore > 0 && semanticScore > SEMANTIC_MATCH_THRESHOLD
        ? 'keyword + semantic'
        : semanticScore > SEMANTIC_MATCH_THRESHOLD
          ? 'semantic'
          : 'keyword'

      return {
        pattern,
        score: Math.round(score * 100) / 100,
        reason: `${matchKind} match with historical defect: ${pattern.symptom} (semantic ${semanticScore.toFixed(2)}, keyword ${keywordScore.toFixed(2)})`,
      }
    })

    return results
      .filter((match) => match.score > SEMANTIC_MATCH_THRESHOLD)
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
