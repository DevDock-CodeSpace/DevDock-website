// Chooses the model provider from the function's secrets. Another provider is
// one file beside gemini.ts and one entry here; nothing else changes.
//
//   AI_PROVIDER     which entry below to use (default: gemini)
//   GEMINI_API_KEY  the key; without it the assistant reports "not set up"
//   GEMINI_MODEL    the model id (default: DEFAULT_GEMINI_MODEL)
//   GEMINI_BASE_URL optional API base, for a proxy or a local stand-in

import type { AiProvider } from '../agent/types.ts'
import { createGeminiProvider } from './gemini.ts'

type Env = (name: string) => string | undefined

const providers: Record<string, (env: Env) => AiProvider | null> = {
  gemini: (env) => {
    const apiKey = env('GEMINI_API_KEY')?.trim()
    return apiKey ? createGeminiProvider({ apiKey, model: env('GEMINI_MODEL'), baseUrl: env('GEMINI_BASE_URL') }) : null
  },
}

/** null when the chosen provider is unknown or has no key. */
export function createProvider(env: Env): AiProvider | null {
  const name = (env('AI_PROVIDER') ?? 'gemini').trim().toLowerCase()
  return providers[name]?.(env) ?? null
}
