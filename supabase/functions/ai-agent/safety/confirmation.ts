// Confirmation: which tools ask first, and the pending actions that wait for
// the person's answer. Policy comes from a tool's risk, never from its name.
//
// A pending action is stored on the server with the arguments already
// validated. Confirming sends back only its id (and edits to fields the tool
// marked editable), so the browser can't swap in another tool or other
// arguments, and a claim that succeeds once makes a replay do nothing.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { validate } from '../agent/schema.ts'
import type { AiExecutionContext, AiTool, AiToolExecutor, AiToolResult, PendingAiAction } from '../agent/types.ts'
import type { ToolRegistry } from '../tools/registry.ts'

/** How long a prepared action waits for its confirmation. */
export const PENDING_TTL_MS = 10 * 60_000

/** read and write run when asked for; external and destructive always ask first. */
export function requiresConfirmation(executor: Pick<AiToolExecutor, 'risk' | 'confirm'>): boolean {
  return executor.risk === 'external' || executor.risk === 'destructive' || executor.confirm === true
}

export type NewPendingAction = Pick<PendingAiAction, 'userId' | 'teamId' | 'workspaceId' | 'toolName' | 'args'>

export interface PendingActionStore {
  create(action: NewPendingAction): Promise<PendingAiAction>
  /** The person's own action, or null. */
  get(id: string, userId: string): Promise<PendingAiAction | null>
  /** Marks it executed and stores the final arguments. False when it was already executed or has expired. */
  claim(id: string, userId: string, args: unknown): Promise<boolean>
  remove(id: string, userId: string): Promise<void>
}

type Row = {
  id: string
  user_id: string
  team_id: string
  workspace_id: string | null
  tool_name: string
  args: unknown
  expires_at: string
  executed_at: string | null
}

const COLUMNS = 'id, user_id, team_id, workspace_id, tool_name, args, expires_at, executed_at'

const fromRow = (row: Row): PendingAiAction => ({
  id: row.id,
  userId: row.user_id,
  teamId: row.team_id,
  workspaceId: row.workspace_id,
  toolName: row.tool_name,
  args: row.args,
  expiresAt: row.expires_at,
  executedAt: row.executed_at,
})

/**
 * `ai_pending_actions`, through the service role: browsers have no grants on
 * the table, which is what stops one from writing an action of its own and
 * then confirming it. This client is used for that table and nothing else;
 * every query below is pinned to the verified user id.
 */
export function supabasePendingStore(admin: SupabaseClient): PendingActionStore {
  const table = () => admin.from('ai_pending_actions')
  return {
    async create(action) {
      // The table cleans itself: a person's finished and expired actions go when they prepare the next one.
      const { error: cleanupError } = await table()
        .delete()
        .eq('user_id', action.userId)
        .or(`executed_at.not.is.null,expires_at.lt.${new Date().toISOString()}`)
      if (cleanupError) console.error('[ai-agent] pending cleanup failed', cleanupError.code)

      const { data, error } = await table()
        .insert({
          user_id: action.userId,
          team_id: action.teamId,
          workspace_id: action.workspaceId,
          tool_name: action.toolName,
          args: action.args,
          expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
        })
        .select(COLUMNS)
        .single()
      if (error) throw new Error(`pending action insert failed (${error.code})`)
      return fromRow(data as Row)
    },
    async get(id, userId) {
      const { data, error } = await table().select(COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle()
      if (error) throw new Error(`pending action read failed (${error.code})`)
      return data ? fromRow(data as Row) : null
    },
    async claim(id, userId, args) {
      const now = new Date().toISOString()
      // One statement: of two confirmations racing, only one finds executed_at still null.
      const { data, error } = await table()
        .update({ executed_at: now, args })
        .eq('id', id)
        .eq('user_id', userId)
        .is('executed_at', null)
        .gt('expires_at', now)
        .select('id')
      if (error) throw new Error(`pending action claim failed (${error.code})`)
      return (data?.length ?? 0) === 1
    },
    async remove(id, userId) {
      const { error } = await table().delete().eq('id', id).eq('user_id', userId).is('executed_at', null)
      if (error) throw new Error(`pending action delete failed (${error.code})`)
    },
  }
}

/** The same rules in memory, for tests. */
export function memoryPendingStore(now: () => number = Date.now): PendingActionStore & { rows: Map<string, PendingAiAction> } {
  const rows = new Map<string, PendingAiAction>()
  return {
    rows,
    create(action) {
      const row: PendingAiAction = {
        ...action,
        id: crypto.randomUUID(),
        expiresAt: new Date(now() + PENDING_TTL_MS).toISOString(),
        executedAt: null,
      }
      rows.set(row.id, row)
      return Promise.resolve(row)
    },
    get(id, userId) {
      const row = rows.get(id)
      return Promise.resolve(row && row.userId === userId ? row : null)
    },
    claim(id, userId, args) {
      const row = rows.get(id)
      if (!row || row.userId !== userId || row.executedAt || Date.parse(row.expiresAt) <= now()) return Promise.resolve(false)
      rows.set(id, { ...row, args, executedAt: new Date(now()).toISOString() })
      return Promise.resolve(true)
    },
    remove(id, userId) {
      const row = rows.get(id)
      if (row && row.userId === userId && !row.executedAt) rows.delete(id)
      return Promise.resolve()
    },
  }
}

const fail = (code: Extract<AiToolResult, { success: false }>['code'], message: string): AiToolResult => ({ success: false, code, message })

/** Applies the person's edits to the fields the tool allows, and nothing else. */
function withEdits(tool: AiTool, args: unknown, edits: Record<string, string> | undefined): unknown {
  if (!edits || typeof args !== 'object' || args === null) return args
  const next: Record<string, unknown> = { ...(args as Record<string, unknown>) }
  for (const field of tool.executor.editable ?? []) {
    const value = edits[field.name]
    if (typeof value === 'string') next[field.name] = value.slice(0, field.maxLength)
  }
  return next
}

/**
 * Runs a stored action once, as the person who prepared it. The context must
 * already be the verified one for this request; the action must belong to the
 * same person and group.
 */
export async function confirmPendingAction(input: {
  store: PendingActionStore
  registry: ToolRegistry
  context: AiExecutionContext
  pendingActionId: string
  edits?: Record<string, string>
  now?: () => number
}): Promise<{ tool: AiTool | null; result: AiToolResult }> {
  const { store, registry, context, pendingActionId, edits } = input
  const now = input.now ?? Date.now
  const pending = await store.get(pendingActionId, context.userId)
  if (!pending || pending.teamId !== context.teamId) {
    return { tool: null, result: fail('NOT_FOUND', 'That request is no longer waiting. Ask again.') }
  }
  if (pending.executedAt) return { tool: null, result: fail('ALREADY_EXECUTED', 'That was already done.') }
  if (Date.parse(pending.expiresAt) <= now()) return { tool: null, result: fail('EXPIRED', 'That request expired. Ask again.') }

  const tool = registry.get(pending.toolName)
  if (!tool) return { tool: null, result: fail('UNKNOWN_TOOL', 'That action is no longer available.') }

  // Stored arguments were validated when prepared; edits make them untrusted again.
  const checked = validate(tool.definition.inputSchema, withEdits(tool, pending.args, edits))
  if (!checked.ok) return { tool, result: fail('INVALID_ARGUMENTS', checked.errors.join('; ')) }

  if (!(await store.claim(pending.id, context.userId, checked.value))) {
    return { tool, result: fail('ALREADY_EXECUTED', 'That was already done.') }
  }
  const result = await tool.executor.execute(checked.value, {
    ...context,
    workspaceId: pending.workspaceId ?? undefined,
    idempotencyKey: pending.id,
  })
  return { tool, result }
}
