// Meetings (live_sessions in the database; "meeting" everywhere the model or
// the user can see). Read-only. The room name is never selected: a room is
// only reachable through the jaas-token function.

import { formatLocal, rangeOf, type DayRange } from '../agent/time.ts'
import type { AiExecutionContext, AiToolResult } from '../agent/types.ts'
import { loadPeople } from './people.ts'
import { defineTool } from './registry.ts'
import { dbFailure, docToText, fail, likePattern, ok } from './shared.ts'

const COLUMNS = 'id, title, starts_at, ends_at, workspace_id, workspace:workspaces!live_sessions_workspace_team_fkey(id, title)'

type MeetingRow = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  workspace_id: string | null
  workspace: { id: string; title: string } | null
}

/** As sessionStatus() in src/features/live/time.ts. */
function statusOf(row: Pick<MeetingRow, 'starts_at' | 'ends_at'>, now: number) {
  if (now >= Date.parse(row.ends_at)) return 'ended'
  return now >= Date.parse(row.starts_at) ? 'happening now' : 'upcoming'
}

const summary = (row: MeetingRow, context: AiExecutionContext) => ({
  id: row.id,
  title: row.title,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  /** In the person's time zone, ready to say. */
  when: `${formatLocal(row.starts_at, context.timeZone)} – ${new Intl.DateTimeFormat('en-US', { timeZone: context.timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(row.ends_at))}`,
  status: statusOf(row, Date.parse(context.currentTime)),
  for: row.workspace?.title ?? 'The whole group',
})

/** Ids of everyone a meeting is for: its workspace's people, or the group. */
async function audienceOf(context: AiExecutionContext, workspaceId: string | null): Promise<AiToolResult<{ id: string; name: string }[]>> {
  if (!workspaceId) return loadPeople(context)
  // The one call the app uses for "everyone in the workspace", including people its access setting lets in.
  const { data, error } = await context.db.rpc('workspace_people', { p_workspace_id: workspaceId })
  if (error) return dbFailure('load the meeting’s people', error)
  return ok((data as { user_id: string; display_name: string | null }[]).map((p) => ({ id: p.user_id, name: p.display_name?.trim() || 'Unnamed member' })))
}

const RANGES = ['upcoming', 'today', 'tomorrow', 'this_week', 'next_week'] as const

type UpcomingArgs = {
  range?: (typeof RANGES)[number]
  from?: string
  to?: string
  withUserId?: string
  query?: string
  limit?: number
}

export const meetingTools = [
  defineTool<UpcomingArgs>({
    name: 'get_upcoming_meetings',
    description:
      'List the user’s meetings in the current group. Use range for "today", "tomorrow", "this week" or "next week"; ' +
      'the default, "upcoming", lists the next meetings from now (the first one is the next meeting). ' +
      'withUserId keeps only meetings that person is also part of. Times come back in the user’s time zone.',
    domain: 'meetings',
    capability: 'search',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', enum: RANGES },
        from: { type: 'string', format: 'date-time', description: 'Instead of range: meetings ending after this ISO time.' },
        to: { type: 'string', format: 'date-time', description: 'Instead of range: meetings starting before this ISO time.' },
        withUserId: { type: 'string', format: 'uuid', description: 'A person id from find_user.' },
        query: { type: 'string', description: 'Words from the meeting’s title.', maxLength: 80 },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Default 10.' },
      },
    },
    async execute(args, context) {
      const now = new Date(context.currentTime)
      const range = args.range ?? 'upcoming'
      const named = range === 'upcoming' ? null : rangeOf(range as DayRange, now, context.timeZone)
      const from = args.from ?? (named ? named.from.toISOString() : now.toISOString())
      const to = args.to ?? named?.to.toISOString()
      const limit = args.limit ?? 10

      let query = context.db.from('live_sessions').select(COLUMNS).eq('team_id', context.teamId).gt('ends_at', from)
      if (to) query = query.lt('starts_at', to)
      if (args.query) query = query.ilike('title', likePattern(args.query))
      // More than asked for, because the "with a person" filter runs afterwards.
      const { data, error } = await query.order('starts_at').limit(args.withUserId ? 60 : limit + 1)
      if (error) return dbFailure('load meetings', error)
      let rows = data as unknown as MeetingRow[]

      if (args.withUserId) {
        const scopes = [...new Set(rows.map((r) => r.workspace_id))].slice(0, 12)
        const audiences = await Promise.all(scopes.map((scope) => audienceOf(context, scope)))
        const includes = new Map(scopes.map((scope, i) => [scope, audiences[i].success && audiences[i].data.some((p) => p.id === args.withUserId)]))
        rows = rows.filter((r) => includes.get(r.workspace_id) === true)
      }
      return ok({
        meetings: rows.slice(0, limit).map((row) => summary(row, context)),
        ...(rows.length > limit ? { note: `There are more than ${limit}. Narrow the range to see the rest.` } : {}),
      })
    },
  }),

  defineTool<{ meetingId: string }>({
    name: 'get_meeting',
    description: 'Get one meeting by id (from get_upcoming_meetings): title, time, who it is for, the organizer, its description and the people invited.',
    domain: 'meetings',
    capability: 'get',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { meetingId: { type: 'string', format: 'uuid' } },
      required: ['meetingId'],
    },
    async execute({ meetingId }, context) {
      const { data, error } = await context.db
        .from('live_sessions')
        .select(`${COLUMNS}, description, author:profiles!live_sessions_created_by_fkey(display_name)`)
        .eq('id', meetingId)
        .eq('team_id', context.teamId)
        .maybeSingle()
      if (error) return dbFailure('load the meeting', error)
      if (!data) return fail('NOT_FOUND', 'That meeting doesn’t exist, or you don’t have access to it.')
      const row = data as unknown as MeetingRow & { description: string | null; author: { display_name: string | null } | null }

      const [people, replies] = await Promise.all([
        audienceOf(context, row.workspace_id),
        context.db.from('live_session_rsvps').select('status, profile:profiles(display_name)').eq('session_id', meetingId).limit(60),
      ])
      const replyRows = (replies.data ?? []) as unknown as { status: string; profile: { display_name: string | null } | null }[]
      return ok({
        ...summary(row, context),
        organizer: row.author?.display_name ?? null,
        description: row.description ? docToText({ text: row.description }, 500) : null,
        ...(people.success ? { people: people.data.slice(0, 30).map((p) => p.name), peopleCount: people.data.length } : {}),
        ...(replyRows.length > 0
          ? { inviteReplies: replyRows.flatMap((r) => (r.profile?.display_name ? [{ name: r.profile.display_name, reply: r.status === 'needsAction' ? 'no reply yet' : r.status }] : [])) }
          : {}),
      })
    },
  }),
]
