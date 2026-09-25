import { FunctionsHttpError } from '@supabase/supabase-js'
import { queryOptions } from '@tanstack/react-query'
import type { PersonProfile } from '@/features/teams/api'
import type { WorkspaceType } from '@/features/workspaces/api'
import { DataError, requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

// Live sessions: scheduled Jitsi (JaaS) calls. Same scope model and access
// rules as docs (workspace_id null = group-wide): readers see and join, writers
// (group owners/admins, workspace leads) schedule, edit and cancel. The room
// itself is only reachable with a token from the jaas-token Edge Function.

export type LiveSession = {
  id: string
  team_id: string
  workspace_id: string | null
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  calendar_event_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  author: PersonProfile | null
  workspace: { id: string; title: string; type: WorkspaceType } | null
}

// room_name is left out: the browser only gets it with a JaaS token.
const COLUMNS =
  'id, team_id, workspace_id, title, description, starts_at, ends_at, calendar_event_id, created_by, created_at, updated_at, author:profiles!live_sessions_created_by_fkey(display_name, avatar_url), workspace:workspaces!live_sessions_workspace_team_fkey(id, title, type)'

const writeErrors = {
  '42501': 'You don’t have permission to schedule sessions here.',
  '23514': 'Check the times: a session ends after it starts and lasts at most 12 hours.',
}

// ---------------------------------------------------------------- queries

/** Group → Live: group-wide sessions plus sessions of every workspace the caller can see. */
export const teamLiveSessionsQuery = (teamId: string) =>
  queryOptions({
    queryKey: ['live', 'team', teamId],
    queryFn: async (): Promise<LiveSession[]> => {
      const { data, error } = await supabase
        .from('live_sessions')
        .select(COLUMNS)
        .eq('team_id', teamId)
        .order('starts_at', { ascending: true })
      if (error) throw toDataError('load live sessions', error)
      return data
    },
  })

/** Workspace → Live: only this workspace's sessions. */
export const workspaceLiveSessionsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['live', 'workspace', workspaceId],
    queryFn: async (): Promise<LiveSession[]> => {
      const { data, error } = await supabase
        .from('live_sessions')
        .select(COLUMNS)
        .eq('workspace_id', workspaceId)
        .order('starts_at', { ascending: true })
      if (error) throw toDataError('load live sessions', error)
      return data
    },
  })

/** null when the session doesn't exist or the caller can't see it. */
export const liveSessionQuery = (sessionId: string) =>
  queryOptions({
    queryKey: ['live', sessionId],
    queryFn: async (): Promise<LiveSession | null> => {
      const { data, error } = await supabase.from('live_sessions').select(COLUMNS).eq('id', sessionId).maybeSingle()
      if (error) throw toDataError('load the session', error)
      return data
    },
  })

// -------------------------------------------------------------- mutations

export type LiveSessionInput = {
  title: string
  description: string
  startsAt: string
  endsAt: string
}

/** created_by and room_name are set by the database; the scope can't change later. */
export async function createLiveSession(
  input: LiveSessionInput & { teamId: string; workspaceId: string | null },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('live_sessions')
    .insert({
      team_id: input.teamId,
      workspace_id: input.workspaceId,
      title: input.title.trim(),
      description: input.description.trim() || null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
    })
    .select('id')
    .single()
  if (error) throw toDataError('schedule the session', error, writeErrors)
  return data
}

export async function updateLiveSession(sessionId: string, input: LiveSessionInput) {
  const { data, error } = await supabase
    .from('live_sessions')
    .update({
      title: input.title.trim(),
      description: input.description.trim() || null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
    })
    .eq('id', sessionId)
    .select('id')
  if (error) throw toDataError('save the session', error, writeErrors)
  requireAffected(data, 'update live session')
}

export async function setCalendarEventId(sessionId: string, eventId: string | null) {
  const { data, error } = await supabase
    .from('live_sessions')
    .update({ calendar_event_id: eventId })
    .eq('id', sessionId)
    .select('id')
  if (error) throw toDataError('save the calendar event', error, writeErrors)
  requireAffected(data, 'set calendar event id')
}

export async function deleteLiveSession(sessionId: string) {
  const { data, error } = await supabase.from('live_sessions').delete().eq('id', sessionId).select('id')
  if (error) throw toDataError('cancel the session', error, writeErrors)
  requireAffected(data, 'delete live session')
}

/** Emails of everyone the session is for (group or workspace), minus the caller. Writers only. */
export async function fetchInvitees(sessionId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('live_session_invitees', { p_session_id: sessionId })
  if (error) throw toDataError('load the invite list', error)
  return data.map((row) => row.email)
}

// ------------------------------------------------------------------ JaaS

export type JaasToken = { token: string; appId: string; roomName: string }

const tokenErrors: Record<string, string> = {
  not_configured: 'Live video isn’t set up yet. The group owner needs to add the JaaS keys.',
  too_early: 'This session opens 15 minutes before it starts.',
  ended: 'This session has ended.',
  not_found: 'This session doesn’t exist anymore, or you don’t have access to it.',
  unauthorized: 'Your session expired. Sign in again to join.',
}

/** A short-lived JaaS token for this session (the Edge Function checks access). */
export async function fetchJaasToken(sessionId: string): Promise<JaasToken> {
  const { data, error } = await supabase.functions.invoke<JaasToken>('jaas-token', { body: { sessionId } })
  if (error || !data) {
    let code: string | undefined
    if (error instanceof FunctionsHttpError) {
      code = await (error.context as Response)
        .json()
        .then((body: { error?: string }) => body.error)
        .catch(() => undefined)
    }
    console.error('[live] jaas-token failed', code ?? error)
    throw new DataError((code && tokenErrors[code]) ?? 'Couldn’t join the call. Please try again.', code, {
      cause: error,
    })
  }
  return data
}
