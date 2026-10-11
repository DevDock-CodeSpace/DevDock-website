// Shared types for the AI agent. Nothing here knows about a model provider or
// about any DevDock feature: tools, the registry, the runner and the
// confirmation flow all meet through these.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// ------------------------------------------------------------------ schema

/** The JSON Schema subset tool inputs are written in (agent/schema.ts validates it). */
export type JsonSchema =
  | {
      type: 'string'
      description?: string
      enum?: readonly string[]
      minLength?: number
      maxLength?: number
      format?: 'uuid' | 'date' | 'date-time'
    }
  | { type: 'integer' | 'number'; description?: string; minimum?: number; maximum?: number }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; description?: string; items: JsonSchema; minItems?: number; maxItems?: number }
  | ObjectSchema

export type ObjectSchema = {
  type: 'object'
  description?: string
  properties: Record<string, JsonSchema>
  required?: readonly string[]
}

// ------------------------------------------------------------------- tools

/** read: no change. write: changes DevDock data. external: reaches another person. destructive: can't be undone. */
export type AiToolRisk = 'read' | 'write' | 'external' | 'destructive'

/** What the model is shown. Nothing about how the tool runs belongs here. */
export type AiToolDefinition = {
  name: string
  description: string
  inputSchema: ObjectSchema
}

export type AiErrorCode =
  | 'INVALID_ARGUMENTS'
  | 'NOT_FOUND'
  | 'AMBIGUOUS'
  | 'NEEDS_CLARIFICATION'
  | 'PERMISSION_DENIED'
  | 'STATUS_LOCKED'
  | 'NOT_ALLOWED'
  | 'UNKNOWN_TOOL'
  | 'TIMEOUT'
  | 'EXPIRED'
  | 'ALREADY_EXECUTED'
  | 'INTERNAL'

export type AiToolResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; code: AiErrorCode; message: string; details?: unknown }

/** What a person sees before a confirmed action runs. */
export type AiActionPreview = {
  /** "Send to Sree" */
  title: string
  /** The main text of the action, e.g. the message. */
  body?: string
  fields?: { label: string; value: string }[]
  /** Label of the confirm button: "Send". */
  confirmLabel: string
}

/** A field of the stored arguments the person may change before confirming (re-validated on the server). */
export type AiEditableField = { name: string; label: string; maxLength: number }

/** A checked action that waits for the person's confirmation. */
export type PreparedAction<A = unknown> = { args: A; preview: AiActionPreview }

/** The trusted, server-side half of a tool. */
export type AiToolExecutor<A = unknown> = {
  risk: AiToolRisk
  /** Ask first even though the risk alone wouldn't require it. It can never switch confirmation off. */
  confirm?: boolean
  execute: (args: A, context: AiExecutionContext) => Promise<AiToolResult>
  /**
   * For confirmed tools: check the arguments against DevDock **without changing anything**
   * and describe what will happen. Required when the tool needs confirmation.
   */
  prepare?: (args: A, context: AiExecutionContext) => Promise<AiToolResult<PreparedAction<A>>>
  /** Arguments the person may edit on the confirmation card. */
  editable?: readonly AiEditableField[]
  /** What to tell the person after a confirmed run succeeded. */
  confirmedMessage?: (data: unknown) => string
}

export type AiTool = {
  definition: AiToolDefinition
  /** The feature the tool belongs to: 'issues', 'messaging', … */
  domain: string
  /** What it does within the domain: 'search', 'get', 'create', 'update', 'send', … */
  capability: string
  executor: AiToolExecutor
}

// ----------------------------------------------------------------- context

/** What the person has open, resolved and checked on the server. */
export type AiCurrentEntity = {
  type: 'issue' | 'meeting' | 'conversation' | 'workspace'
  /** How tools refer to it: an issue identifier (CAP-12) or an id. */
  ref: string
  /** A short name for the prompt. */
  label: string
}

/**
 * Who is asking and where. Everything here comes from the verified session or
 * was re-read under RLS; nothing is taken from the model.
 */
export type AiExecutionContext = {
  requestId: string
  userId: string
  userName: string
  teamId: string
  teamName: string
  workspaceId?: string
  workspaceName?: string
  /** ISO timestamp of the request. */
  currentTime: string
  /** The person's IANA time zone (for "today"). */
  timeZone: string
  currentEntity?: AiCurrentEntity
  /** Supabase as the caller: every query and RPC runs under their RLS. */
  db: SupabaseClient
  /** Calls another DevDock Edge Function as the caller. */
  callFunction: (name: string, body: Record<string, unknown>) => Promise<AiToolResult>
  /** Set while a confirmed action runs: the pending action's id, for idempotent writes. */
  idempotencyKey?: string
}

// ---------------------------------------------------------------- provider

export type AiToolCall = { id: string; name: string; args: unknown }

export type AiMessage =
  | { role: 'user'; text: string }
  | {
      role: 'assistant'
      text?: string
      toolCalls?: AiToolCall[]
      /** Whatever the provider needs to replay its own turn exactly. Opaque to the runner. */
      providerData?: unknown
    }
  | { role: 'tool'; results: { callId: string; name: string; result: AiToolResult }[] }

export type AiProviderInput = {
  system: string
  messages: AiMessage[]
  tools: AiToolDefinition[]
  signal?: AbortSignal
}

export type AiProviderResponse = {
  text: string | null
  toolCalls: AiToolCall[]
  providerData?: unknown
}

/** A language model that can call tools. The runner depends only on this. */
export interface AiProvider {
  readonly name: string
  readonly model: string
  run(input: AiProviderInput): Promise<AiProviderResponse>
}

export type AiProviderErrorKind = 'not_configured' | 'rate_limited' | 'unavailable' | 'timeout' | 'bad_response'

export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind

  constructor(kind: AiProviderErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AiProviderError'
    this.kind = kind
  }
}

// ------------------------------------------------------- request / response

/** What the browser sends about the open page: identifiers only. */
export type AiEntityInput =
  | { type: 'issue'; workspaceId: string; number: number }
  | { type: 'meeting'; id: string }
  | { type: 'conversation'; id: string }
  | { type: 'workspace'; id: string }

/** The browser never sends a user id: it comes from the session. */
export type AiAgentRequest =
  | {
      action?: 'message'
      message: string
      teamId: string
      workspaceId?: string
      currentEntity?: AiEntityInput
      timeZone?: string
      /** The last few turns of this chat, oldest first. */
      history?: { role: 'user' | 'assistant'; text: string }[]
    }
  | { action: 'confirm'; pendingActionId: string; teamId: string; edits?: Record<string, string>; timeZone?: string }
  | { action: 'cancel'; pendingActionId: string; teamId: string }

export type AiAgentResponse =
  | { type: 'message'; message: string }
  | {
      type: 'confirmation'
      message: string
      pendingActionId: string
      expiresAt: string
      preview: AiActionPreview
      editable: { name: string; label: string; maxLength: number; value: string }[]
    }
  | { type: 'error'; code: string; message: string }

// ----------------------------------------------------------- pending action

export type PendingAiAction = {
  id: string
  userId: string
  teamId: string
  workspaceId: string | null
  toolName: string
  args: unknown
  expiresAt: string
  executedAt: string | null
}
