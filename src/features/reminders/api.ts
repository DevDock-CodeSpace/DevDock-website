import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

// Notes (code and tables still say reminders): private notes to self in one group, optionally with a
// time at which they pop up and land in the bell, and optionally about a workspace and an issue in it. Every rule lives in the database (RLS, column grants and the check_reminder
// trigger), so these functions stay thin and anything else that writes reminders (the AI agent,
// later) goes through the same rules. Delivery is server-side: a pg_cron job puts a notification in
// the bell when one is due (private.fire_due_reminders). Design record: docs/REMINDERS.md.

export type ReminderStatus = Database['public']['Enums']['reminder_status']

export const TITLE_MAX = 200
export const NOTES_MAX = 2000
/** Rows per request in each section. */
export const REMINDERS_PAGE = 25

export type Reminder = {
  id: string
  team_id: string
  workspace_id: string | null
  issue_id: string | null
  title: string
  notes: string | null
  /** When the note should pop up and reach the bell; null for a note that doesn't remind. */
  remind_at: string | null
  status: ReminderStatus
  completed_at: string | null
  cancelled_at: string | null
  /** When the bell got its notification; null until it fires (and again after a snooze). */
  notified_at: string | null
  updated_at: string
  /** Null when there is none, or it can no longer be opened. */
  workspace: { title: string; issue_key: string } | null
  issue: { number: number; title: string } | null
}

const COLUMNS =
  'id, team_id, workspace_id, issue_id, title, notes, remind_at, status, completed_at, cancelled_at, notified_at, updated_at, workspace:workspaces(title, issue_key), issue:issues(number, title)'

export const reminderKeys = {
  all: ['reminders'] as const,
  lists: ['reminders', 'list'] as const,
  list: (teamId: string, userId: string, status: ReminderStatus) => ['reminders', 'list', teamId, userId, status] as const,
  issueOptions: (workspaceId: string) => ['reminders', 'issue-options', workspaceId] as const,
}

export type RemindersPage = { rows: Reminder[]; total: number; next: number | undefined }

/** How each section is sorted: open ones soonest first, finished ones latest first. */
const ORDER: Record<ReminderStatus, { column: 'remind_at' | 'completed_at' | 'cancelled_at'; ascending: boolean }> = {
  pending: { column: 'remind_at', ascending: true },
  completed: { column: 'completed_at', ascending: false },
  cancelled: { column: 'cancelled_at', ascending: false },
}

/** One section of the caller's reminders in a group, REMINDERS_PAGE at a time. RLS shows only your own. */
export const remindersPageQuery = (teamId: string, userId: string, status: ReminderStatus) =>
  infiniteQueryOptions({
    queryKey: reminderKeys.list(teamId, userId, status),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<RemindersPage> => {
      const { column, ascending } = ORDER[status]
      const { data, error, count } = await supabase
        .from('reminders')
        .select(COLUMNS, { count: 'exact' })
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .eq('status', status)
        // Notes with a time first (soonest); Postgres puts the ones without last. Then newest first.
        .order(column, { ascending })
        .order('created_at', { ascending: false })
        .order('id')
        .range(pageParam, pageParam + REMINDERS_PAGE - 1)
      if (error) throw toDataError('load reminders', error)
      const total = count ?? data.length
      const after = pageParam + data.length
      return { rows: data, total, next: data.length === REMINDERS_PAGE && after < total ? after : undefined }
    },
    getNextPageParam: (last) => last.next,
  })

export type IssueOption = { id: string; number: number; title: string }
export type IssueOptions = { key: string; issues: IssueOption[] }

/** The issues a reminder can be about in one workspace, newest first, with its key. Loaded when the picker opens. */
export const reminderIssueOptionsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: reminderKeys.issueOptions(workspaceId),
    queryFn: async (): Promise<IssueOptions> => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('issue_key, issues(id, number, title)')
        .eq('id', workspaceId)
        .order('number', { referencedTable: 'issues', ascending: false })
        .limit(500, { referencedTable: 'issues' })
        .maybeSingle()
      if (error) throw toDataError('load issues', error)
      return { key: data?.issue_key ?? '', issues: data?.issues ?? [] }
    },
  })

/** What a person fills in. Never an owner: the signed-in person always owns their reminders. */
export type ReminderInput = {
  title: string
  notes?: string | null
  /** ISO timestamp (stored as timestamptz, shown in the browser's time zone); null = a note with no time. */
  remindAt: string | null
  workspaceId?: string | null
  /** An issue brings its workspace (the database sets it). */
  issueId?: string | null
}

export type CreateReminderInput = ReminderInput & { teamId: string }

/** Why the input can't be saved, or null. The database checks the same and more. */
export function reminderInputProblem(input: Partial<ReminderInput>): string | null {
  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title) return 'Give the note a title.'
    if (title.length > TITLE_MAX) return `Keep the title under ${TITLE_MAX} characters.`
  }
  if (input.notes && input.notes.trim().length > NOTES_MAX) return `Keep the notes under ${NOTES_MAX} characters.`
  if (input.remindAt && Number.isNaN(Date.parse(input.remindAt))) return 'Pick a valid date and time.'
  return null
}

function assertValid(input: Partial<ReminderInput>) {
  const problem = reminderInputProblem(input)
  if (problem) throw new Error(problem)
}

/** Only the fields given; undefined leaves a column as it is. */
function toRow(input: Partial<ReminderInput>) {
  return {
    ...(input.title !== undefined && { title: input.title.trim() }),
    ...(input.notes !== undefined && { notes: input.notes?.trim() || null }),
    ...(input.remindAt !== undefined && { remind_at: input.remindAt === null ? null : new Date(input.remindAt).toISOString() }),
    ...(input.workspaceId !== undefined && { workspace_id: input.workspaceId }),
    ...(input.issueId !== undefined && { issue_id: input.issueId }),
  }
}

export async function createReminder(input: CreateReminderInput): Promise<Reminder> {
  assertValid(input)
  const { data, error } = await supabase
    .from('reminders')
    .insert({ team_id: input.teamId, title: input.title, ...toRow(input) })
    .select(COLUMNS)
    .single()
  if (error) throw toDataError('create the reminder', error)
  return data
}

/** Title, notes, time, workspace or issue. A later time lets a reminder that already fired fire again. */
export async function updateReminder(id: string, patch: Partial<ReminderInput>): Promise<Reminder> {
  assertValid(patch)
  const { data, error } = await supabase.from('reminders').update(toRow(patch)).eq('id', id).select(COLUMNS)
  if (error) throw toDataError('save the reminder', error)
  return requireAffected(data, 'update reminder')[0]
}

/** The database stamps completed_at / cancelled_at and clears the reminder's notification. */
export async function setReminderStatus(id: string, status: ReminderStatus): Promise<Reminder> {
  const { data, error } = await supabase.from('reminders').update({ status }).eq('id', id).select(COLUMNS)
  if (error) throw toDataError('update the reminder', error)
  return requireAffected(data, 'set reminder status')[0]
}

export const completeReminder = (id: string) => setReminderStatus(id, 'completed')
export const cancelReminder = (id: string) => setReminderStatus(id, 'cancelled')
export const reopenReminder = (id: string) => setReminderStatus(id, 'pending')
