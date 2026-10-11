// Gemini, behind the AiProvider interface. Everything Gemini-specific lives in
// this file: its request and response shapes, its schema dialect and its error
// codes. The runner, the registry and the tools never see any of it.
//
// It uses function calling over the REST generateContent endpoint; the key is
// sent in a header (never in the URL, so it can't end up in a log line).

import { AiProviderError, type AiMessage, type AiProvider, type AiProviderInput, type AiProviderResponse, type AiToolDefinition, type JsonSchema } from '../agent/types.ts'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const REQUEST_TIMEOUT_MS = 25_000

type Part = {
  text?: string
  thought?: boolean
  functionCall?: { name?: string; args?: unknown; id?: string }
  functionResponse?: { name: string; response: unknown; id?: string }
  [key: string]: unknown
}
type Content = { role: 'user' | 'model'; parts: Part[] }

/** Our schema subset in Gemini's dialect: upper-case types and only the keywords it accepts. */
function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type.toUpperCase() }
  if (schema.description) out.description = schema.description
  if (schema.type === 'string' && schema.enum) out.enum = [...schema.enum]
  if (schema.type === 'array') out.items = toGeminiSchema(schema.items)
  if (schema.type === 'object') {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)]))
    if (schema.required?.length) out.required = [...schema.required]
  }
  return out
}

function toDeclaration(tool: AiToolDefinition) {
  const parameters = toGeminiSchema(tool.inputSchema)
  // Gemini refuses an object schema without properties.
  return Object.keys(tool.inputSchema.properties).length > 0
    ? { name: tool.name, description: tool.description, parameters }
    : { name: tool.name, description: tool.description }
}

/** What we keep of a model turn so it can be replayed exactly (thought signatures ride on its parts). */
type GeminiTurn = { parts: Part[]; callIds: Record<string, string | undefined> }

function toContents(messages: AiMessage[]): Content[] {
  const contents: Content[] = []
  let lastTurn: GeminiTurn | undefined
  for (const message of messages) {
    if (message.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: message.text }] })
    } else if (message.role === 'assistant') {
      lastTurn = message.providerData as GeminiTurn | undefined
      const parts: Part[] =
        lastTurn?.parts ??
        [
          ...(message.text ? [{ text: message.text }] : []),
          ...(message.toolCalls ?? []).map((call) => ({ functionCall: { name: call.name, args: call.args } })),
        ]
      if (parts.length > 0) contents.push({ role: 'model', parts })
    } else {
      contents.push({
        role: 'user',
        parts: message.results.map((r) => {
          const id = lastTurn?.callIds[r.callId]
          return { functionResponse: { name: r.name, response: r.result, ...(id ? { id } : {}) } }
        }),
      })
    }
  }
  return contents
}

function errorFor(status: number): AiProviderError {
  if (status === 429) return new AiProviderError('rate_limited', 'Gemini rate limit reached')
  if (status === 401 || status === 403 || status === 404) return new AiProviderError('not_configured', `Gemini refused the key or model (${status})`)
  if (status >= 500) return new AiProviderError('unavailable', `Gemini is unavailable (${status})`)
  return new AiProviderError('bad_response', `Gemini rejected the request (${status})`)
}

export function createGeminiProvider(options: { apiKey: string; model?: string; baseUrl?: string; fetch?: typeof fetch }): AiProvider {
  const model = options.model?.trim() || DEFAULT_GEMINI_MODEL
  // Overridable so a proxy or a local stand-in can be used; the default is Google's API.
  const baseUrl = (options.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const send = options.fetch ?? fetch

  async function request(body: unknown, signal: AbortSignal | undefined): Promise<Response> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    try {
      return await send(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      if (name === 'TimeoutError' || name === 'AbortError') throw new AiProviderError('timeout', 'Gemini took too long', { cause: error })
      throw new AiProviderError('unavailable', 'Gemini could not be reached', { cause: error })
    }
  }

  return {
    name: 'gemini',
    model,
    async run(input: AiProviderInput): Promise<AiProviderResponse> {
      const body = {
        systemInstruction: { parts: [{ text: input.system }] },
        contents: toContents(input.messages),
        ...(input.tools.length > 0 ? { tools: [{ functionDeclarations: input.tools.map(toDeclaration) }] } : {}),
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }

      let response = await request(body, input.signal)
      // One retry for a passing overload; anything else is reported as it is.
      if (response.status >= 500) {
        await response.body?.cancel()
        await new Promise((resolve) => setTimeout(resolve, 600))
        response = await request(body, input.signal)
      }
      if (!response.ok) {
        // The body can echo the prompt; only the status is kept.
        await response.body?.cancel()
        throw errorFor(response.status)
      }

      let payload: { candidates?: { content?: { parts?: Part[] } }[] }
      try {
        payload = await response.json()
      } catch (error) {
        throw new AiProviderError('bad_response', 'Gemini returned something unreadable', { cause: error })
      }
      const parts = payload.candidates?.[0]?.content?.parts ?? []

      const callIds: Record<string, string | undefined> = {}
      const toolCalls = parts.flatMap((part, index) => {
        if (!part.functionCall?.name) return []
        const id = `call-${index}-${crypto.randomUUID().slice(0, 8)}`
        callIds[id] = part.functionCall.id
        return [{ id, name: part.functionCall.name, args: part.functionCall.args ?? {} }]
      })
      const text = parts
        .filter((part) => typeof part.text === 'string' && !part.thought)
        .map((part) => part.text)
        .join('')
        .trim()

      const turn: GeminiTurn = { parts, callIds }
      return { text: text || null, toolCalls, providerData: turn }
    },
  }
}
