import { queryOptions } from '@tanstack/react-query'
import type { PersonProfile } from '@/features/teams/api'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Database, Json, TablesInsert } from '@/types/database.types'

// Issues live in one workspace. Anyone who can see the workspace can create
// and edit them; leads and team owners/admins delete issues and manage labels.
// RLS enforces all of it; see the create_issues migration.

export type IssueStatus = Database['public']['Enums']['issue_status']
/** Linear's scale: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export type IssuePriority = 0 | 1 | 2 | 3 | 4
export type LabelColor = 'default' | 'blue' | 'teal' | 'green' | 'amber' | 'orange' | 'red' | 'pink' | 'violet'

export type Issue = {
  id: string
  workspace_id: string
  number: number
  title: string
  status: IssueStatus
  priority: IssuePriority
  assignee_id: string | null
  parent_id: string | null
  cycle_id: string | null
  estimate: number | null
  due_date: string | null
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  labelIds: string[]
}
/** One issue with its description and creator. */
export type IssueDetail = Issue & { description: Json | null; creator: PersonProfile }

/** A Linear-style cycle (sprint). Dates are local calendar dates ("YYYY-MM-DD"). */
export type IssueCycle = {
  id: string
  workspace_id: string
  number: number
  name: string | null
  starts_on: string
  ends_on: string
}

export type ActivityKind =
  | 'created'
  | 'title'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'parent'
  | 'cycle'
  | 'estimate'
  | 'due_date'
  | 'label_added'
  | 'label_removed'

/** One change to an issue, written by a database trigger. Values are text (ids for assignee/parent/cycle). */
export type IssueActivity = {
  id: number
  kind: ActivityKind
  from_value: string | null
  to_value: string | null
  actor_id: string | null
  created_at: string
  actor: PersonProfile
}

export type IssueLabel = { id: string; workspace_id: string; name: string; color: LabelColor }
export type IssueComment = {
  id: string
  issue_id: string
  body: string
  author_id: string | null
  created_at: string
  updated_at: string
  author: PersonProfile
}

/** Fields the UI can change on an existing issue (column grants allow exactly these). */
export type IssuePatch = Partial<
  Pick<Issue, 'title' | 'status' | 'priority' | 'assignee_id' | 'parent_id' | 'cycle_id' | 'estimate' | 'due_date'> & {
    description: Json | null
  }
>

const ISSUE_COLUMNS =
  'id, workspace_id, number, title, status, priority, assignee_id, parent_id, cycle_id, estimate, due_date, completed_at, created_by, created_at, updated_at, issue_label_links(label_id)'

type IssueRow = Omit<Issue, 'labelIds' | 'priority'> & { priority: number; issue_label_links: { label_id: string }[] }

function toIssue({ issue_label_links, priority, ...row }: IssueRow): Issue {
  return { ...row, priority: priority as IssuePriority, labelIds: issue_label_links.map((l) => l.label_id) }
}

const writeErrors = {
  '42501': 'You don’t have permission to change issues here.',
  '23514': 'That change isn’t allowed. Assignees must be in this workspace, and an issue can’t be its own sub-issue.',
}

// ---------------------------------------------------------------- queries

export const issueKeys = {
  all: ['issues'] as const,
  workspace: (workspaceId: string) => ['issues', 'workspace', workspaceId] as const,
  detail: (workspaceId: string, number: number) => ['issues', 'detail', workspaceId, number] as const,
  labels: (workspaceId: string) => ['issues', 'labels', workspaceId] as const,
  comments: (issueId: string) => ['issues', 'comments', issueId] as const,
  activity: (issueId: string) => ['issues', 'activity', issueId] as const,
  cycles: (workspaceId: string) => ['issues', 'cycles', workspaceId] as const,
}

/** Every issue in the workspace (small teams: one query, grouped and filtered client-side). */
export const workspaceIssuesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: issueKeys.workspace(workspaceId),
    queryFn: async (): Promise<Issue[]> => {
      const { data, error } = await supabase
        .from('issues')
        .select(ISSUE_COLUMNS)
        .eq('workspace_id', workspaceId)
        .order('number', { ascending: false })
      if (error) throw toDataError('load issues', error)
      return data.map(toIssue)
    },
  })

/** An issue with its project and assignee, for the group-wide Issues page. */
export type TeamIssue = Issue & {
  workspace: { id: string; title: string; issue_key: string }
  assignee: PersonProfile
}

/** Issues from every workspace in the group the caller can see (RLS). */
export const teamIssuesQuery = (teamId: string) =>
  queryOptions({
    queryKey: ['issues', 'team', teamId],
    queryFn: async (): Promise<TeamIssue[]> => {
      const { data, error } = await supabase
        .from('issues')
        .select(
          `${ISSUE_COLUMNS}, workspace:workspaces!issues_workspace_team_fkey(id, title, issue_key), assignee:profiles!issues_assignee_id_fkey(display_name, avatar_url)`,
        )
        .eq('team_id', teamId)
        .order('updated_at', { ascending: false })
      if (error) throw toDataError('load issues', error)
      return data.map(({ workspace, assignee, ...row }) => ({ ...toIssue(row), workspace, assignee }))
    },
  })

/** null when the issue doesn't exist or the caller can't see it. */
export const issueQuery = (workspaceId: string, number: number) =>
  queryOptions({
    queryKey: issueKeys.detail(workspaceId, number),
    queryFn: async (): Promise<IssueDetail | null> => {
      const { data, error } = await supabase
        .from('issues')
        .select(`${ISSUE_COLUMNS}, description, creator:profiles!issues_created_by_fkey(display_name, avatar_url)`)
        .eq('workspace_id', workspaceId)
        .eq('number', number)
        .maybeSingle()
      if (error) throw toDataError('load the issue', error)
      if (!data) return null
      const { description, creator, ...row } = data
      return { ...toIssue(row), description, creator }
    },
  })

export const labelsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: issueKeys.labels(workspaceId),
    queryFn: async (): Promise<IssueLabel[]> => {
      const { data, error } = await supabase
        .from('issue_labels')
        .select('id, workspace_id, name, color')
        .eq('workspace_id', workspaceId)
        .order('name')
      if (error) throw toDataError('load labels', error)
      return data as IssueLabel[]
    },
  })

/** Oldest first. */
export const cyclesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: issueKeys.cycles(workspaceId),
    queryFn: async (): Promise<IssueCycle[]> => {
      const { data, error } = await supabase
        .from('issue_cycles')
        .select('id, workspace_id, number, name, starts_on, ends_on')
        .eq('workspace_id', workspaceId)
        .order('starts_on')
      if (error) throw toDataError('load cycles', error)
      return data
    },
  })

export const activityQuery = (issueId: string) =>
  queryOptions({
    queryKey: issueKeys.activity(issueId),
    queryFn: async (): Promise<IssueActivity[]> => {
      const { data, error } = await supabase
        .from('issue_activity')
        .select('id, kind, from_value, to_value, actor_id, created_at, actor:profiles!issue_activity_actor_id_fkey(display_name, avatar_url)')
        .eq('issue_id', issueId)
        .order('created_at')
        .order('id')
      if (error) throw toDataError('load the activity', error)
      return data as IssueActivity[]
    },
  })

export const commentsQuery = (issueId: string) =>
  queryOptions({
    queryKey: issueKeys.comments(issueId),
    queryFn: async (): Promise<IssueComment[]> => {
      const { data, error } = await supabase
        .from('issue_comments')
        .select('id, issue_id, body, author_id, created_at, updated_at, author:profiles!issue_comments_author_id_fkey(display_name, avatar_url)')
        .eq('issue_id', issueId)
        .order('created_at')
      if (error) throw toDataError('load comments', error)
      return data
    },
  })

// -------------------------------------------------------------- mutations

export type NewIssue = {
  workspaceId: string
  title: string
  description?: Json | null
  status?: IssueStatus
  priority?: IssuePriority
  assigneeId?: string | null
  parentId?: string | null
  cycleId?: string | null
  labelIds?: string[]
}

/** number, team_id and created_by are set by the database. */
export async function createIssue(input: NewIssue): Promise<{ id: string; number: number }> {
  const row: Omit<TablesInsert<'issues'>, 'team_id' | 'number'> = {
    workspace_id: input.workspaceId,
    title: input.title.trim(),
    description: input.description ?? null,
    status: input.status ?? 'todo',
    priority: input.priority ?? 0,
    assignee_id: input.assigneeId ?? null,
    parent_id: input.parentId ?? null,
    cycle_id: input.cycleId ?? null,
  }
  // Generated types can't see the insert trigger that fills team_id and number.
  const { data, error } = await supabase
    .from('issues')
    .insert(row as TablesInsert<'issues'>)
    .select('id, number')
    .single()
  if (error) throw toDataError('create the issue', error, writeErrors)
  if (input.labelIds?.length) await setIssueLabels(data.id, input.labelIds)
  return data
}

export async function updateIssue(issueId: string, patch: IssuePatch) {
  const update = patch.title === undefined ? patch : { ...patch, title: patch.title.trim() }
  const { data, error } = await supabase.from('issues').update(update).eq('id', issueId).select('id')
  if (error) throw toDataError('save the issue', error, writeErrors)
  requireAffected(data, 'update issue')
}

/** Replaces the issue's labels atomically (RPC, runs under RLS). */
export async function setIssueLabels(issueId: string, labelIds: string[]) {
  const { error } = await supabase.rpc('set_issue_labels', { p_issue_id: issueId, p_label_ids: labelIds })
  if (error) throw toDataError('save the labels', error, writeErrors)
}

/** Sub-issues are kept and become top-level (parent_id → null). */
export async function deleteIssue(issueId: string) {
  const { data, error } = await supabase.from('issues').delete().eq('id', issueId).select('id')
  if (error) throw toDataError('delete the issue', error)
  requireAffected(data, 'delete issue')
}

const labelErrors = {
  '42501': 'Only workspace leads and group owners/admins can manage labels.',
  '23505': 'A label with that name already exists.',
}

export async function createLabel(workspaceId: string, name: string, color: LabelColor): Promise<IssueLabel> {
  const { data, error } = await supabase
    .from('issue_labels')
    .insert({ workspace_id: workspaceId, name: name.trim(), color })
    .select('id, workspace_id, name, color')
    .single()
  if (error) throw toDataError('create the label', error, labelErrors)
  return data as IssueLabel
}

export async function updateLabel(labelId: string, input: { name: string; color: LabelColor }) {
  const { data, error } = await supabase
    .from('issue_labels')
    .update({ name: input.name.trim(), color: input.color })
    .eq('id', labelId)
    .select('id')
  if (error) throw toDataError('save the label', error, labelErrors)
  requireAffected(data, 'update label')
}

export async function deleteLabel(labelId: string) {
  const { data, error } = await supabase.from('issue_labels').delete().eq('id', labelId).select('id')
  if (error) throw toDataError('delete the label', error, labelErrors)
  requireAffected(data, 'delete label')
}

const cycleErrors = {
  '42501': 'Only workspace leads and group owners/admins can manage cycles.',
  '23P01': 'Those dates overlap another cycle.',
  '23514': 'The end date must be on or after the start date.',
}

export type CycleInput = { name: string; startsOn: string; endsOn: string }

/** The number is set by the database (next in the workspace). */
export async function createCycle(workspaceId: string, input: CycleInput) {
  const row = { workspace_id: workspaceId, name: input.name.trim() || null, starts_on: input.startsOn, ends_on: input.endsOn }
  // Generated types can't see the trigger that sets `number`.
  const { data, error } = await supabase
    .from('issue_cycles')
    .insert(row as TablesInsert<'issue_cycles'>)
    .select('number')
    .single()
  if (error) throw toDataError('create the cycle', error, cycleErrors)
  return data
}

export async function updateCycle(cycleId: string, input: CycleInput) {
  const { data, error } = await supabase
    .from('issue_cycles')
    .update({ name: input.name.trim() || null, starts_on: input.startsOn, ends_on: input.endsOn })
    .eq('id', cycleId)
    .select('id')
  if (error) throw toDataError('save the cycle', error, cycleErrors)
  requireAffected(data, 'update cycle')
}

/** Its issues are kept, without a cycle. */
export async function deleteCycle(cycleId: string) {
  const { data, error } = await supabase.from('issue_cycles').delete().eq('id', cycleId).select('id')
  if (error) throw toDataError('delete the cycle', error, cycleErrors)
  requireAffected(data, 'delete cycle')
}

/** Moves a cycle's unfinished issues to another cycle (or out of cycles). Returns how many moved. */
export async function moveOpenIssues(fromCycleId: string, toCycleId: string | null): Promise<number> {
  // The function accepts null (out of cycles); generated RPC argument types are never nullable.
  const { data, error } = await supabase.rpc('move_open_issues', { p_from: fromCycleId, p_to: toCycleId as string })
  if (error) throw toDataError('move the issues', error, writeErrors)
  return data
}

export async function addComment(issueId: string, workspaceId: string, body: string) {
  const { error } = await supabase
    .from('issue_comments')
    .insert({ issue_id: issueId, workspace_id: workspaceId, body: body.trim() })
  if (error) throw toDataError('post the comment', error)
}

export async function updateComment(commentId: string, body: string) {
  const { data, error } = await supabase
    .from('issue_comments')
    .update({ body: body.trim() })
    .eq('id', commentId)
    .select('id')
  if (error) throw toDataError('save the comment', error)
  requireAffected(data, 'update comment')
}

export async function deleteComment(commentId: string) {
  const { data, error } = await supabase.from('issue_comments').delete().eq('id', commentId).select('id')
  if (error) throw toDataError('delete the comment', error)
  requireAffected(data, 'delete comment')
}
