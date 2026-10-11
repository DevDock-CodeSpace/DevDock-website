// ai-agent: Ask DevDock. The person's request goes to a language model with a
// small set of tool definitions; the tools the model picks run here, as that
// person, through the same tables, RPCs and functions the app uses.
//
// POST with the user's Supabase access token:
//   { message, teamId, workspaceId?, currentEntity?, timeZone?, history? }
//       → { type: 'message', message }
//       → { type: 'confirmation', message, pendingActionId, expiresAt, preview, editable }
//       → { type: 'error', code, message }
//   { action: 'confirm', pendingActionId, teamId, edits? }  → message | error
//   { action: 'cancel',  pendingActionId, teamId }          → message
//   401 not signed in · 404 group or workspace not visible · 429 too many requests
//   503 switched off or not set up
//
// Secrets (`supabase secrets set`, never in the repo or a VITE_ variable):
//   GEMINI_API_KEY   the model provider's key
//   GEMINI_MODEL     optional model id (providers/gemini.ts has the default)
//   AI_PROVIDER      optional, default gemini (providers/index.ts)
//   AI_ENABLED       optional; "false" switches the assistant off
//
// Who may do what is decided by the database: every tool runs with the
// caller's token under RLS. The service role is used for one table only,
// ai_pending_actions (safety/confirmation.ts). docs/AI_AGENT.md has the rest.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildContext } from './agent/context.ts'
import { logEvent } from './agent/log.ts'
import { buildSystemPrompt, readHistory } from './agent/prompt.ts'
import { runAgent } from './agent/runner.ts'
import { isUuid } from './agent/schema.ts'
import { AiProviderError, type AiAgentResponse, type AiExecutionContext } from './agent/types.ts'
import { createProvider } from './providers/index.ts'
import { confirmPendingAction, supabasePendingStore } from './safety/confirmation.ts'
import { createToolRegistry } from './tools/index.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_MESSAGE_CHARS = 2000
const MAX_BODY_BYTES = 64_000
/** The whole request, model and tools together. */
const REQUEST_TIMEOUT_MS = 50_000
const FUNCTION_CALL_TIMEOUT_MS = 12_000

// Built once per isolate. A duplicate tool name throws here, at start-up.
const registry = createToolRegistry()

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// A brake on loops and runaway scripts, not a quota: counts live in this
// isolate's memory, so they reset when it is recycled.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 20
const recent = new Map<string, number[]>()

function overLimit(userId: string, now: number): boolean {
  const times = (recent.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (times.length >= RATE_MAX) {
    recent.set(userId, times)
    return true
  }
  recent.set(userId, [...times, now])
  if (recent.size > 500) for (const [key, value] of recent) if (value.every((t) => now - t >= RATE_WINDOW_MS)) recent.delete(key)
  return false
}

const UNAVAILABLE = 'DevDock AI is temporarily unavailable. Your other DevDock features are unaffected.'

const providerMessages: Record<AiProviderError['kind'], string> = {
  not_configured: 'DevDock AI isn’t set up correctly yet. The group owner needs to check its key and model.',
  rate_limited: 'DevDock AI is busy right now. Try again in a minute.',
  unavailable: UNAVAILABLE,
  timeout: 'That took too long. Try again, or ask for one thing at a time.',
  bad_response: UNAVAILABLE,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (Deno.env.get('AI_ENABLED')?.trim().toLowerCase() === 'false') return json({ error: 'disabled' }, 503)

  const accessToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'unauthorized' }, 401)

  let body: Record<string, unknown>
  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'bad_request' }, 400)
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return json({ error: 'bad_request' }, 400)
    body = parsed as Record<string, unknown>
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  // Every tool query runs through this client: the caller's token, their RLS.
  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await db.auth.getUser(accessToken)
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)
  // The only source of the user's identity. Nothing in the body or from the model can replace it.
  const userId = userData.user.id

  const requestId = crypto.randomUUID()
  const started = Date.now()
  if (overLimit(userId, started)) {
    logEvent(requestId, 'rate_limited', { userId })
    return json({ error: 'rate_limited' }, 429)
  }

  /** Another DevDock function, as the caller (the github function's create_branch). */
  const callFunction: AiExecutionContext['callFunction'] = async (name, payload) => {
    try {
      const response = await fetch(`${url}/functions/v1/${name}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(FUNCTION_CALL_TIMEOUT_MS),
      })
      const data: unknown = await response.json().catch(() => null)
      if (response.ok) return { success: true, data }
      const code = (data as { error?: unknown } | null)?.error
      return { success: false, code: 'INTERNAL', message: 'That didn’t work.', details: typeof code === 'string' ? code : undefined }
    } catch {
      return { success: false, code: 'TIMEOUT', message: 'That took too long.' }
    }
  }

  const action = body.action ?? 'message'
  const built = await buildContext({ db, userId, requestId, callFunction, body })
  if (!built.ok) return json({ error: built.code }, built.status)
  const context = built.context

  // The service role, for ai_pending_actions only; tools never receive this client.
  const store = supabasePendingStore(
    createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } }),
  )

  const finish = (response: AiAgentResponse) => {
    logEvent(requestId, 'done', {
      userId,
      action: String(action),
      ms: Date.now() - started,
      outcome: response.type,
      code: response.type === 'error' ? response.code : undefined,
    })
    return json(response)
  }

  try {
    if (action === 'confirm' || action === 'cancel') {
      if (!isUuid(body.pendingActionId)) return json({ error: 'bad_request' }, 400)
      if (action === 'cancel') {
        await store.remove(body.pendingActionId, userId)
        return finish({ type: 'message', message: 'Cancelled. Nothing was sent.' })
      }
      const edits =
        typeof body.edits === 'object' && body.edits !== null
          ? Object.fromEntries(Object.entries(body.edits).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
          : undefined
      const { tool, result } = await confirmPendingAction({ store, registry, context, pendingActionId: body.pendingActionId, edits })
      logEvent(requestId, 'confirmed', { tool: tool?.definition.name, success: result.success, code: result.success ? undefined : result.code })
      return finish(
        result.success
          ? { type: 'message', message: tool?.executor.confirmedMessage?.(result.data) ?? 'Done.' }
          : { type: 'error', code: result.code, message: result.message },
      )
    }

    if (action !== 'message') return json({ error: 'bad_request' }, 400)
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message || message.length > MAX_MESSAGE_CHARS) return json({ error: 'bad_request' }, 400)

    const provider = createProvider((name) => Deno.env.get(name))
    if (!provider) return json({ error: 'not_configured' }, 503)

    return finish(
      await runAgent({
        provider,
        registry,
        context,
        store,
        system: buildSystemPrompt(context),
        history: readHistory(body.history),
        message,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    )
  } catch (error) {
    if (error instanceof AiProviderError) {
      logEvent(requestId, 'provider_error', { kind: error.kind })
      return finish({ type: 'error', code: error.kind, message: providerMessages[error.kind] })
    }
    // Never the raw error: it goes to the logs by name, the person gets a plain sentence.
    console.error(`[ai-agent] ${requestId} failed`, error instanceof Error ? error.message : error)
    return finish({ type: 'error', code: 'server_error', message: UNAVAILABLE })
  }
})
