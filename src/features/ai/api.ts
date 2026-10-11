import { FunctionsHttpError } from '@supabase/supabase-js'
import { DataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

// Ask DevDock: the browser's side of the `ai-agent` Edge Function. The model
// provider's key, the tools and every permission check live in the function;
// the browser sends what was typed and where the person is, and never a user id.
// How it works: docs/AI_AGENT.md.

/** What is open, as identifiers only. The function re-reads it under RLS. */
export type AiPageEntity =
  | { type: 'issue'; workspaceId: string; number: number }
  | { type: 'meeting'; id: string }
  | { type: 'conversation'; id: string }

export type AiPageContext = { workspaceId?: string; currentEntity?: AiPageEntity }

export type AiPreview = {
  title: string
  body?: string
  fields?: { label: string; value: string }[]
  confirmLabel: string
}

export type AiEditableField = { name: string; label: string; maxLength: number; value: string }

export type AiConfirmation = {
  type: 'confirmation'
  message: string
  pendingActionId: string
  expiresAt: string
  preview: AiPreview
  editable: AiEditableField[]
}

export type AiResponse = { type: 'message'; message: string } | AiConfirmation | { type: 'error'; code: string; message: string }

export type AiHistoryTurn = { role: 'user' | 'assistant'; text: string }

/** The longest request the function accepts. */
export const AI_MESSAGE_MAX = 2000

const UNAVAILABLE = 'DevDock AI is temporarily unavailable. Your other DevDock features are unaffected.'

const httpErrors: Record<string, string> = {
  unauthorized: 'Your session expired. Sign in again to use DevDock AI.',
  not_found: 'You don’t have access to this group or project anymore.',
  rate_limited: 'That’s a lot of requests. Wait a minute and try again.',
  disabled: 'DevDock AI is switched off.',
  not_configured: 'DevDock AI isn’t set up yet. The group owner needs to add its key.',
  bad_request: 'That request couldn’t be read. Try a shorter message.',
}

async function call(body: Record<string, unknown>): Promise<AiResponse> {
  const { data, error } = await supabase.functions.invoke<AiResponse>('ai-agent', { body })
  if (error || !data) {
    let code: string | undefined
    if (error instanceof FunctionsHttpError) {
      code = await (error.context as Response)
        .json()
        .then((b: { error?: string }) => b.error)
        .catch(() => undefined)
    }
    console.error('[ai] request failed', code ?? error)
    throw new DataError((code && httpErrors[code]) ?? UNAVAILABLE, code, { cause: error })
  }
  return data
}

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

export const askDevDock = (input: { message: string; teamId: string; page: AiPageContext; history: AiHistoryTurn[] }) =>
  call({ message: input.message, teamId: input.teamId, ...input.page, history: input.history, timeZone: timeZone() })

/** Runs a prepared action. Only its id and the allowed edits are sent; the function holds the rest. */
export const confirmAiAction = (input: { pendingActionId: string; teamId: string; edits?: Record<string, string> }) =>
  call({ action: 'confirm', ...input, timeZone: timeZone() })

export const cancelAiAction = (input: { pendingActionId: string; teamId: string }) => call({ action: 'cancel', ...input })
