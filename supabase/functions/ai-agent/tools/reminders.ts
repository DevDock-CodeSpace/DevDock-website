// Reminders: the user's own, private, time-based reminders in the current group. Every query and
// write is the one the Reminders page makes (src/features/reminders/api.ts), as the caller, so RLS
// (owner only), the column grants and the check_reminder trigger decide what is allowed. Delivery
// is the database's job (pg_cron → the bell); these tools only create and change reminders.
//
// Times: the model never does date arithmetic or time-zone conversion. It passes minutes from now,
// a local date and time, or a meeting and "minutes before it", and the server turns that into an
// instant in the user's time zone. There is deliberately no way to pass a raw timestamp: a model
// that was handed a UTC start time kept its digits and stamped the local offset on them (a
// reminder for 11:00 AM came out at 4:00 PM).

import { isUuid } from '../agent/schema.ts'
import { formatLocal, localDate, localTimeOfDay, rangeOf, zonedInstant, type DayRange } from '../agent/time.ts'
import type { AiExecutionContext, AiToolResult, JsonSchema } from '../agent/types.ts'
import { loadIssue } from './issues.ts'
import { defineTool } from './registry.ts'
import { bestMatches, dbFailure, DENIED, fail, likePattern, ok } from './shared.ts'

// The limits the reminders table checks (reminders_title_length, reminders_notes_length).
const TITLE_MAX = 200
const NOTES_MAX = 2000
const MINUTE = 60_000
/** A time a little in the past is "now" (the request took a moment); more than this is a mistake. */
const GRACE_MS = 2 * MINUTE
const MAX_AHEAD_MS = 5 * 366 * 24 * 60 * MINUTE

const COLUMNS =
  'id, title, notes, remind_at, status, completed_at, cancelled_at, workspace_id, issue_id, workspace:workspaces(title, issue_key), issue:issues(number, title)'

type ReminderStatus = 'pending' | 'completed' | 'cancelled'

type ReminderRow = {
  id: string
  title: string
  notes: string | null
  remind_at: string
  status: ReminderStatus
  completed_at: string | null
  cancelled_at: string | null
  workspace_id: string | null
  issue_id: string | null
  workspace: { title: string; issue_key: string } | null
  issue: { number: number; title: string } | null
}

const WRITE_ERRORS = {
  '23503': { code: 'NOT_FOUND', message: 'That issue or project isn’t one you can open in this group.' },
  '23514': { code: 'INVALID_ARGUMENTS', message: `Keep the title under ${TITLE_MAX} characters and the notes under ${NOTES_MAX}.` },
  '54000': { code: 'NOT_ALLOWED', message: 'You have the most open reminders allowed in this group (500). Complete or cancel some first.' },
} as const

/** What the model needs to talk about a reminder. The id is there to act on it next. */
function summary(row: ReminderRow, context: AiExecutionContext) {
  const now = Date.parse(context.currentTime)
  const state =
    row.status === 'pending' ? (Date.parse(row.remind_at) <= now ? 'overdue' : 'upcoming') : row.status === 'completed' ? 'completed' : 'cancelled'
  return {
    id: row.id,
    title: row.title,
    /** In the user's time zone, ready to say. */
    when: formatLocal(row.remind_at, context.timeZone),
    remindAt: new Date(row.remind_at).toISOString(),
    status: state,
    issue: row.issue && row.workspace ? `${row.workspace.issue_key}-${row.issue.number}` : null,
    project: row.workspace?.title ?? null,
    ...(row.notes ? { notes: row.notes.length > 200 ? `${row.notes.slice(0, 200)}…` : row.notes } : {}),
  }
}

// ------------------------------------------------------------------- when

type WhenArgs = { inMinutes?: number; date?: string; time?: string; meetingId?: string; minutesBefore?: number }

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const WHEN_PROPERTIES: Record<string, JsonSchema> = {
  inMinutes: { type: 'integer', minimum: 1, maximum: 525_600, description: 'Minutes from now ("in 45 minutes" → 45, "in 2 hours" → 120).' },
  date: { type: 'string', format: 'date', description: 'Local date, YYYY-MM-DD, worked out from today in the context.' },
  time: { type: 'string', maxLength: 5, description: 'Local time, 24-hour HH:MM ("9 am" → 09:00, "3:30 pm" → 15:30, "afternoon" → 15:00, "morning" → 09:00, "evening" → 18:00).' },
  meetingId: { type: 'string', format: 'uuid', description: 'A meeting’s id from the meetings tools, to remind the user shortly before it starts. Needs minutesBefore.' },
  minutesBefore: { type: 'integer', minimum: 0, maximum: 10_080, description: 'With meetingId: how many minutes before the meeting starts ("10 minutes before" → 10, "when it starts" → 0). If the user didn’t say, ask.' },
}

/** Past, absurdly far ahead, or not a date at all. A time a little in the past is "now". */
function checkBounds(at: Date, context: AiExecutionContext): AiToolResult<Date> {
  const now = new Date(context.currentTime)
  if (Number.isNaN(at.getTime())) return fail('INVALID_ARGUMENTS', 'That isn’t a valid time.')
  if (at.getTime() < now.getTime() - GRACE_MS) {
    return fail('INVALID_ARGUMENTS', `That time (${formatLocal(at.toISOString(), context.timeZone)}) has already passed. Ask for a later one.`)
  }
  if (at.getTime() > now.getTime() + MAX_AHEAD_MS) return fail('INVALID_ARGUMENTS', 'That is too far ahead. Pick a time within five years.')
  return ok(at)
}

type Meeting = { title: string; startsAt: string; when: string }

/** The meeting's start, read as the caller (RLS decides whether they can see it). */
async function findMeeting(context: AiExecutionContext, id: string): Promise<AiToolResult<Meeting>> {
  if (!isUuid(id)) return fail('INVALID_ARGUMENTS', 'meetingId must be a meeting id from the meetings tools.')
  const { data, error } = await context.db.from('live_sessions').select('title, starts_at').eq('id', id).eq('team_id', context.teamId).maybeSingle()
  if (error) return dbFailure('load the meeting', error)
  if (!data) return fail('NOT_FOUND', 'That meeting isn’t one you can open in this group.')
  const row = data as { title: string; starts_at: string }
  return ok({ title: row.title, startsAt: row.starts_at, when: formatLocal(row.starts_at, context.timeZone) })
}

/**
 * The instant the arguments describe, or null when they give no time. Exactly one way: minutes
 * from now, a local date and/or time, or minutes before a meeting. When changing a reminder, a
 * date alone keeps its time of day and a time alone keeps its date. A new reminder with a time
 * and no date is today, or tomorrow if that time has passed. `meeting` is set when one was used.
 */
async function resolveWhen(
  args: WhenArgs,
  context: AiExecutionContext,
  current?: string,
): Promise<(AiToolResult<Date> & { meeting?: Meeting }) | null> {
  const meetingWay = args.meetingId !== undefined || args.minutesBefore !== undefined
  const ways = [args.inMinutes !== undefined, args.date !== undefined || args.time !== undefined, meetingWay].filter(Boolean).length
  if (ways === 0) return null
  if (ways > 1) return fail('INVALID_ARGUMENTS', 'Give the time one way: inMinutes, or date and time, or meetingId with minutesBefore.')
  if (args.time !== undefined && !TIME.test(args.time)) return fail('INVALID_ARGUMENTS', 'time must be 24-hour HH:MM, like 09:00 or 15:30.')

  if (meetingWay) {
    if (args.meetingId === undefined) return fail('INVALID_ARGUMENTS', 'minutesBefore needs a meetingId.')
    if (args.minutesBefore === undefined) return fail('NEEDS_CLARIFICATION', 'Ask how many minutes before the meeting to remind them (for example 5, 10 or 15).')
    const meeting = await findMeeting(context, args.meetingId)
    if (!meeting.success) return meeting
    const at = checkBounds(new Date(Date.parse(meeting.data.startsAt) - args.minutesBefore * MINUTE), context)
    return at.success ? { ...at, meeting: meeting.data } : at
  }

  const now = new Date(context.currentTime)
  let at: Date
  if (args.inMinutes !== undefined) at = new Date(now.getTime() + args.inMinutes * MINUTE)
  else {
    const was = current ? new Date(current) : null
    const time = args.time ?? (was ? localTimeOfDay(was, context.timeZone) : undefined)
    if (time === undefined) return fail('NEEDS_CLARIFICATION', 'Ask the user what time on that day.')
    if (args.date !== undefined) at = zonedInstant(args.date, time, context.timeZone)
    else if (was) at = zonedInstant(localDate(was, context.timeZone), time, context.timeZone)
    else {
      at = zonedInstant(localDate(now, context.timeZone), time, context.timeZone)
      if (at.getTime() <= now.getTime()) at = zonedInstant(localDate(new Date(now.getTime() + 24 * 60 * MINUTE), context.timeZone), time, context.timeZone)
    }
  }
  return checkBounds(at, context)
}

// --------------------------------------------------------- what it is about

const NONE = 'none'

/** A project (any workspace in the group the user can open) by name. */
async function findWorkspace(context: AiExecutionContext, name: string): Promise<AiToolResult<{ id: string; title: string }>> {
  const { data, error } = await context.db.from('workspaces').select('id, title').eq('team_id', context.teamId).order('title')
  if (error) return dbFailure('load projects', error)
  const rows = data as { id: string; title: string }[]
  const found = bestMatches(rows, name, (w) => w.title)
  if (found.length === 1) return ok(found[0])
  const names = (list: typeof rows) => list.slice(0, 12).map((w) => w.title)
  return found.length === 0
    ? fail('NOT_FOUND', `No project you can open matches "${name}".`, { projects: names(rows) })
    : fail('AMBIGUOUS', `Several projects match "${name}". Ask which one.`, { projects: names(found) })
}

type AboutArgs = { issue?: string; project?: string }

/**
 * The columns the issue and project arguments set: undefined leaves them alone, "none" clears
 * them. An issue brings its own project (the database sets it), so a project is only used alone.
 */
async function resolveAbout(args: AboutArgs, context: AiExecutionContext): Promise<AiToolResult<{ workspace_id?: string | null; issue_id?: string | null }>> {
  const about: { workspace_id?: string | null; issue_id?: string | null } = {}
  if (args.issue !== undefined) {
    if (args.issue.toLowerCase() === NONE) about.issue_id = null
    else {
      const issue = await loadIssue(context, args.issue)
      if (!issue.success) return issue
      about.issue_id = issue.data.id
      about.workspace_id = issue.data.workspace_id
    }
  }
  if (args.project !== undefined && about.workspace_id === undefined) {
    if (args.project.toLowerCase() === NONE) {
      about.workspace_id = null
      about.issue_id = null
    } else {
      const workspace = await findWorkspace(context, args.project)
      if (!workspace.success) return workspace
      about.workspace_id = workspace.data.id
    }
  }
  return ok(about)
}

// --------------------------------------------------------- which reminder

type TargetArgs = { reminderId?: string; reminder?: string }

const TARGET_PROPERTIES: Record<string, JsonSchema> = {
  reminderId: { type: 'string', format: 'uuid', description: 'The id from list_reminders or create_reminder.' },
  reminder: { type: 'string', maxLength: 120, description: 'Otherwise, words from its title or its issue (e.g. "staging", "WA-64").' },
}

/** The user's reminder by id or by words from its title. Candidates instead of a guess. */
async function findReminder(context: AiExecutionContext, args: TargetArgs, statuses: ReminderStatus[]): Promise<AiToolResult<ReminderRow>> {
  if (args.reminderId !== undefined) {
    if (!isUuid(args.reminderId)) return fail('INVALID_ARGUMENTS', 'reminderId must be an id from list_reminders.')
    const { data, error } = await context.db.from('reminders').select(COLUMNS).eq('id', args.reminderId).eq('team_id', context.teamId).maybeSingle()
    if (error) return dbFailure('load the reminder', error)
    return data ? ok(data as unknown as ReminderRow) : fail('NOT_FOUND', 'That reminder doesn’t exist in this group.')
  }
  if (!args.reminder) return fail('NEEDS_CLARIFICATION', 'Ask the user which reminder.')

  const { data, error } = await context.db
    .from('reminders')
    .select(COLUMNS)
    .eq('team_id', context.teamId)
    .eq('user_id', context.userId)
    .in('status', statuses)
    .order('remind_at')
    .limit(200)
  if (error) return dbFailure('load reminders', error)
  const rows = data as unknown as ReminderRow[]
  const label = (r: ReminderRow) => [r.title, r.issue && r.workspace ? `${r.workspace.issue_key}-${r.issue.number}` : '', r.workspace?.title ?? ''].join(' ')
  const found = bestMatches(rows, args.reminder, label)
  if (found.length === 1) return ok(found[0])
  const list = (items: ReminderRow[]) => items.slice(0, 8).map((r) => summary(r, context))
  return found.length === 0
    ? fail('NOT_FOUND', `None of your reminders matches "${args.reminder}".`, { reminders: list(rows) })
    : fail('AMBIGUOUS', `Several reminders match "${args.reminder}". Ask which one.`, { reminders: list(found) })
}

/** One update as the caller, with the reminder back as the page shows it. */
async function write(context: AiExecutionContext, id: string, patch: Record<string, unknown>, action: string): Promise<AiToolResult<ReminderRow>> {
  const { data, error } = await context.db.from('reminders').update(patch).eq('id', id).select(COLUMNS)
  if (error) return dbFailure(action, error, WRITE_ERRORS)
  const rows = data as unknown as ReminderRow[]
  return rows.length === 0 ? DENIED : ok(rows[0])
}

// ------------------------------------------------------------------ tools

const LIST_STATUSES = ['upcoming', 'overdue', 'completed', 'cancelled'] as const
const RANGES = ['today', 'tomorrow', 'this_week', 'next_week'] as const

type CreateArgs = WhenArgs & AboutArgs & { title: string; notes?: string }
type ListArgs = { status?: (typeof LIST_STATUSES)[number]; range?: (typeof RANGES)[number]; query?: string; limit?: number }
type UpdateArgs = TargetArgs & WhenArgs & AboutArgs & { title?: string; notes?: string; reopen?: boolean }

const ABOUT_PROPERTIES: Record<string, JsonSchema> = {
  issue: { type: 'string', maxLength: 20, description: 'An issue identifier like CAP-12 (for "this", the one the user is looking at), or "none" to remove it.' },
  project: { type: 'string', maxLength: 80, description: 'A project name, when the reminder is about a project but no issue; "none" to remove it.' },
}

export const reminderTools = [
  defineTool<CreateArgs>({
    name: 'create_reminder',
    description:
      'Set a reminder for the signed-in user: at that time it shows up in their DevDock notifications. ' +
      'Only for the user themselves; reminders can’t be set for other people. Write the title as what to do ("Review CAP-12", "Deploy staging"). ' +
      'Give the time as inMinutes, or a local date and time, or, for a reminder before a meeting, meetingId (from the meetings tools) with minutesBefore. ' +
      'Never work out a time from a meeting’s startsAt yourself. If the user gave a day but no time, ask what time. ' +
      'When you tell the user the result, say the reminder’s own `when`, not the meeting’s time.',
    domain: 'reminders',
    capability: 'create',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: TITLE_MAX, description: 'What to be reminded of.' },
        notes: { type: 'string', maxLength: NOTES_MAX, description: 'Optional details.' },
        ...WHEN_PROPERTIES,
        ...ABOUT_PROPERTIES,
      },
      required: ['title'],
    },
    async execute(args, context) {
      const at = await resolveWhen(args, context)
      if (at === null) return fail('NEEDS_CLARIFICATION', 'Ask the user when to remind them.')
      if (!at.success) return at
      const about = await resolveAbout(args, context)
      if (!about.success) return about
      const { data, error } = await context.db
        .from('reminders')
        .insert({ team_id: context.teamId, title: args.title, notes: args.notes ?? null, remind_at: at.data.toISOString(), ...about.data })
        .select(COLUMNS)
        .single()
      if (error) return dbFailure('create the reminder', error, WRITE_ERRORS)
      return ok({
        created: summary(data as unknown as ReminderRow, context),
        ...(at.meeting ? { forMeeting: { title: at.meeting.title, starts: at.meeting.when } } : {}),
      })
    },
  }),

  defineTool<ListArgs>({
    name: 'list_reminders',
    description:
      'List the signed-in user’s reminders in this group. status: "upcoming" (default: every open one, overdue first), ' +
      '"overdue" (its time has passed and it isn’t done), "completed" or "cancelled". range narrows open ones to a day or week; query matches the title.',
    domain: 'reminders',
    capability: 'search',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: LIST_STATUSES },
        range: { type: 'string', enum: RANGES },
        query: { type: 'string', maxLength: 80, description: 'Words from the title.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Default 10.' },
      },
    },
    async execute(args, context) {
      const status = args.status ?? 'upcoming'
      const limit = args.limit ?? 10
      const now = new Date(context.currentTime)
      let query = context.db
        .from('reminders')
        .select(COLUMNS, { count: 'exact' })
        .eq('team_id', context.teamId)
        .eq('user_id', context.userId)
        .eq('status', status === 'upcoming' || status === 'overdue' ? 'pending' : status)
      if (status === 'overdue') query = query.lte('remind_at', now.toISOString())
      if (args.range) {
        const { from, to } = rangeOf(args.range as DayRange, now, context.timeZone)
        query = query.gte('remind_at', from.toISOString()).lt('remind_at', to.toISOString())
      }
      if (args.query) query = query.ilike('title', likePattern(args.query))
      const ordered =
        status === 'completed'
          ? query.order('completed_at', { ascending: false })
          : status === 'cancelled'
            ? query.order('cancelled_at', { ascending: false })
            : query.order('remind_at')
      const { data, error, count } = await ordered.limit(limit)
      if (error) return dbFailure('load reminders', error)
      const rows = data as unknown as ReminderRow[]
      const total = count ?? rows.length
      return ok({
        reminders: rows.map((row) => summary(row, context)),
        total,
        ...(total > rows.length ? { note: `Showing ${rows.length} of ${total}.` } : {}),
      })
    },
  }),

  defineTool<UpdateArgs>({
    name: 'update_reminder',
    description:
      'Change one of the user’s reminders: title, notes, time, issue or project, or reopen a completed or cancelled one (reopen: true). ' +
      'A date alone keeps its time of day; a time alone keeps its date. "Snooze for an hour" is inMinutes: 60. Moving it later makes it remind again.',
    domain: 'reminders',
    capability: 'update',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        ...TARGET_PROPERTIES,
        title: { type: 'string', maxLength: TITLE_MAX },
        notes: { type: 'string', maxLength: NOTES_MAX, description: 'New notes; an empty string removes them.' },
        ...WHEN_PROPERTIES,
        ...ABOUT_PROPERTIES,
        reopen: { type: 'boolean', description: 'Make a completed or cancelled reminder open again.' },
      },
    },
    async execute(args, context) {
      // By words: open reminders, or the finished ones when reopening. By id: any of the user's.
      const found = await findReminder(context, args, args.reopen ? ['completed', 'cancelled'] : ['pending'])
      if (!found.success) return found
      const reminder = found.data
      const at = await resolveWhen(args, context, reminder.remind_at)
      if (at && !at.success) return at
      const about = await resolveAbout(args, context)
      if (!about.success) return about
      const patch: Record<string, unknown> = {
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.notes !== undefined ? { notes: args.notes || null } : {}),
        ...(at ? { remind_at: at.data.toISOString() } : {}),
        ...about.data,
        ...(args.reopen && reminder.status !== 'pending' ? { status: 'pending' } : {}),
      }
      if (Object.keys(patch).length === 0) return fail('INVALID_ARGUMENTS', 'Nothing to change. Say what should change.')
      const saved = await write(context, reminder.id, patch, 'save the reminder')
      return saved.success ? ok({ updated: summary(saved.data, context), changed: Object.keys(patch) }) : saved
    },
  }),

  defineTool<TargetArgs>({
    name: 'complete_reminder',
    description: 'Mark one of the user’s reminders as done ("I did the review"). It leaves their notifications.',
    domain: 'reminders',
    capability: 'complete',
    risk: 'write',
    inputSchema: { type: 'object', properties: TARGET_PROPERTIES },
    async execute(args, context) {
      const found = await findReminder(context, args, ['pending'])
      if (!found.success) return found
      if (found.data.status === 'completed') return ok({ completed: summary(found.data, context), note: 'It was already completed.' })
      const saved = await write(context, found.data.id, { status: 'completed' }, 'complete the reminder')
      return saved.success ? ok({ completed: summary(saved.data, context) }) : saved
    },
  }),

  defineTool<TargetArgs>({
    name: 'cancel_reminder',
    description:
      'Cancel one of the user’s reminders so it never reminds them. It can be reopened later with update_reminder (reopen: true), so do it when asked without asking again.',
    domain: 'reminders',
    capability: 'cancel',
    // Not destructive: a cancelled reminder is kept and can be reopened.
    risk: 'write',
    inputSchema: { type: 'object', properties: TARGET_PROPERTIES },
    async execute(args, context) {
      const found = await findReminder(context, args, ['pending'])
      if (!found.success) return found
      if (found.data.status === 'cancelled') return ok({ cancelled: summary(found.data, context), note: 'It was already cancelled.' })
      const saved = await write(context, found.data.id, { status: 'cancelled' }, 'cancel the reminder')
      return saved.success ? ok({ cancelled: summary(saved.data, context) }) : saved
    },
  }),
]
