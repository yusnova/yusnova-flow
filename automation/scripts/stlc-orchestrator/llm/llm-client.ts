export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  messages: LlmMessage[]
  temperature?: number
  responseFormat?: 'text' | 'json'
}

export interface LlmResponse {
  content: string
  model: string
  provider: 'openai-compatible' | 'heuristic'
  confidence: number
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>
  isEnabled(): boolean
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

export function createLlmClient(): LlmClient {
  const apiKey = readEnv('STLC_LLM_API_KEY')
  const baseUrl = readEnv('STLC_LLM_BASE_URL') ?? 'https://api.openai.com/v1'
  const model = readEnv('STLC_LLM_MODEL') ?? 'gpt-4o-mini'

  if (!apiKey) {
    return new HeuristicLlmClient()
  }

  return new OpenAiCompatibleClient({ apiKey, baseUrl, model })
}

class HeuristicLlmClient implements LlmClient {
  isEnabled(): boolean {
    return false
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    return {
      content: lastUser,
      model: 'heuristic-fallback',
      provider: 'heuristic',
      confidence: 0.55,
    }
  }
}

class OpenAiCompatibleClient implements LlmClient {
  constructor(
    private readonly config: { apiKey: string; baseUrl: string; model: string },
  ) {}

  isEnabled(): boolean {
    return true
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      temperature: request.temperature ?? 0.2,
      messages: request.messages,
    }

    if (request.responseFormat === 'json') {
      body.response_format = { type: 'json_object' }
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`LLM request failed (${response.status}): ${detail.slice(0, 300)}`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      model?: string
    }

    const content = payload.choices?.[0]?.message?.content ?? ''
    return {
      content,
      model: payload.model ?? this.config.model,
      provider: 'openai-compatible',
      confidence: 0.85,
    }
  }
}

export function parseJsonResponse<T>(raw: string): T {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonText = fenced?.[1]?.trim() ?? trimmed
  return JSON.parse(jsonText) as T
}
