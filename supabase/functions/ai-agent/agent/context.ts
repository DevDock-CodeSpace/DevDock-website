// Builds the trusted context for one request. The user id comes from the
// verified session and from nowhere else; the group, the workspace and the
// open page are re-read under that user's RLS, so the browser can only point
// at things the person can already open.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { isUuid } from './schema.ts'
import { safeTimeZone } from './time.ts'
import type { AiCurrentEntity, AiExecutionContext } from './types.ts'

export type ContextInput = {
  /** Supabase as the caller. */
  db: SupabaseClient
  /** From auth.getUser() on the request's token. */
  userId: string
  requestId: string
  callFunction: AiExecutionContext['callFunction']
  /** The request body: untrusted. */
  body: Record<string, unknown>
  now?: Date
}

export type ContextResult = { ok: true; context: AiExecutionContext } | { ok: false; status: 400 | 404; code: 'bad_request' | 'not_found' }

const bad: ContextResult = { ok: false, status: 400, code: 'bad_request' }
// One answer for "doesn't exist" and "not yours": the difference is not the caller's to learn.
const notFound: ContextResult = { ok: false, status: 404, code: 'not_found' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The page the person has open, if they can see it. A hint: anything that doesn't check out is dropped. */
async function resolveEntity(db: SupabaseClient, teamId: string, input: unknown): Promise<AiCurrentEntity | undefined> {
  if (!isRecord(input)) return undefined
  if (input.type === 'issue' && isUuid(input.workspaceId) && Number.isInteger(input.number)) {
    const { data } = await db
      .from('issues')
      .select('number, title, workspace:workspaces!issues_workspace_team_fkey(issue_key)')
      .eq('team_id', teamId)
      .eq('workspace_id', input.workspaceId)
      .eq('number', input.number)
      .maybeSingle()
    const row = data as unknown as { number: number; title: string; workspace: { issue_key: string } } | null
    if (!row) return undefined
    const ref = `${row.workspace.issue_key}-${row.number}`
    return { type: 'issue', ref, label: `issue ${ref} “${row.title.slice(0, 120)}”` }
  }
  if (input.type === 'meeting' && isUuid(input.id)) {
    const { data } = await db.from('live_sessions').select('id, title').eq('team_id', teamId).eq('id', input.id).maybeSingle()
    const row = data as { id: string; title: string } | null
    return row ? { type: 'meeting', ref: row.id, label: `the meeting “${row.title.slice(0, 120)}”` } : undefined
  }
  if (input.type === 'conversation' && isUuid(input.id)) {
    const { data } = await db.from('conversations').select('id, kind, name').eq('team_id', teamId).eq('id', input.id).maybeSingle()
    const row = data as { id: string; kind: string; name: string | null } | null
    if (!row) return undefined
    const label = row.kind === 'channel' ? `the channel #${row.name ?? ''}` : row.kind === 'group' ? `the group chat “${row.name ?? 'unnamed'}”` : 'a direct message'
    return { type: 'conversation', ref: row.id, label }
  }
  return undefined
}

export async function buildContext(input: ContextInput): Promise<ContextResult> {
  const { db, userId, body } = input
  const { teamId, workspaceId } = body
  if (!isUuid(teamId)) return bad
  if (workspaceId !== undefined && workspaceId !== null && !isUuid(workspaceId)) return bad

  // The membership row brings the group's name and the person's own name with it: one request, not two.
  // An embed RLS hides comes back null rather than as an error, so a missing name never refuses the request.
  const [membership, workspace, entity] = await Promise.all([
    db
      .from('team_members')
      .select('team:teams(id, name), profile:profiles(display_name)')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle(),
    isUuid(workspaceId) ? db.from('workspaces').select('id, title, team_id').eq('id', workspaceId).maybeSingle() : null,
    resolveEntity(db, teamId, body.currentEntity),
  ])
  const member = membership.data as unknown as {
    team: { id: string; name: string } | null
    profile: { display_name: string | null } | null
  } | null
  const team = member?.team
  if (membership.error || !team) return notFound

  const open = workspace?.data as { id: string; title: string; team_id: string } | null | undefined
  // Asked for a workspace that isn't visible, or belongs to another group: refuse the request.
  if (isUuid(workspaceId) && (!open || open.team_id !== teamId)) return notFound

  return {
    ok: true,
    context: {
      requestId: input.requestId,
      userId,
      userName: member?.profile?.display_name?.trim() || 'the user',
      teamId,
      teamName: team.name,
      workspaceId: open?.id,
      workspaceName: open?.title,
      currentTime: (input.now ?? new Date()).toISOString(),
      timeZone: safeTimeZone(body.timeZone),
      currentEntity: entity ?? (open ? { type: 'workspace', ref: open.title, label: `the project “${open.title}”` } : undefined),
      db,
      callFunction: input.callFunction,
    },
  }
}
