/**
 * Optional embedding provider for semantic RAG search. Follows the same
 * heuristic-first pattern as `llm/llm-client.ts`: without STLC_LLM_API_KEY,
 * embeddings are simply disabled and callers fall back to keyword search —
 * no network calls, no failures, fully functional for local/offline use.
 */
export interface EmbeddingProvider {
  isEnabled(): boolean
  embed(texts: string[]): Promise<number[][]>
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const apiKey = readEnv('STLC_LLM_API_KEY')
  const baseUrl = readEnv('STLC_LLM_BASE_URL') ?? 'https://api.openai.com/v1'
  const model = readEnv('STLC_EMBEDDING_MODEL') ?? 'text-embedding-3-small'

  if (!apiKey) return new DisabledEmbeddingProvider()
  return new OpenAiEmbeddingProvider({ apiKey, baseUrl, model })
}

class DisabledEmbeddingProvider implements EmbeddingProvider {
  isEnabled(): boolean {
    return false
  }

  async embed(): Promise<number[][]> {
    return []
  }
}

class OpenAiEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly config: { apiKey: string; baseUrl: string; model: string }) {}

  isEnabled(): boolean {
    return true
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    const response = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.config.model, input: texts }),
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`Embedding request failed (${response.status}): ${detail.slice(0, 300)}`)
    }

    const payload = (await response.json()) as { data?: Array<{ embedding: number[]; index: number }> }
    const sorted = [...(payload.data ?? [])].sort((a, b) => a.index - b.index)
    return sorted.map((entry) => entry.embedding)
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
