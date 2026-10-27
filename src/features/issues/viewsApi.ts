import { queryOptions } from '@tanstack/react-query'
import { requireAffected, toDataError } from '@/lib/errors'
import { SETTLED_STALE_MS } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database.types'
import type { IssueCycle } from './api'
import type { IssueTab } from './filters'
import { serializeFilters, type ViewState } from './views'

export type IssueView = Tables<'issue_views'>
export type IssuePin = Tables<'issue_pins'>

export const viewKeys = {
  all: ['issues', 'views'] as const,
  workspace: (workspaceId: string) => ['issues', 'views', 'workspace', workspaceId] as const,
  team: (teamId: string) => ['issues', 'views', 'team', teamId] as const,
  pins: (teamId: string) => ['issues', 'pins', teamId] as const,
}

const VIEW_COLUMNS = 'id, team_id, workspace_id, owner_id, name, shared, layout, tab, filters, created_at, updated_at'
const PIN_COLUMNS = 'id, user_id, team_id, workspace_id, kind, view_id, person_id, tab, cycle_id, issue_id, plan_id, position, created_at'

const viewErrors = {
  '23505': 'You already have a view with that name.',
  '23514': 'Give the view a name of up to 60 characters.',
  '54000': 'You can have at most 50 views in a workspace.',
}

/** The views you can see in one workspace: yours, plus the ones shared with it. */
export const workspaceViewsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: viewKeys.workspace(workspaceId),
    queryFn: async (): Promise<IssueView[]> => {
      const { data, error } = await supabase.from('issue_views').select(VIEW_COLUMNS).eq('workspace_id', workspaceId).order('name')
      if (error) throw toDataError('load views', error)
      return data
    },
  })

/** The views you can see in the whole group (the sidebar's pins point into them). */
export const teamViewsQuery = (teamId: string) =>
  queryOptions({
    queryKey: viewKeys.team(teamId),
    staleTime: SETTLED_STALE_MS,
    queryFn: async (): Promise<IssueView[]> => {
      const { data, error } = await supabase.from('issue_views').select(VIEW_COLUMNS).eq('team_id', teamId).order('name')
      if (error) throw toDataError('load views', error)
      return data
    },
  })

/** Everything you starred in the group (the sidebar's Starred list; `issue_pins` in code), in sidebar order. */
export const teamPinsQuery = (teamId: string) =>
  queryOptions({
    queryKey: viewKeys.pins(teamId),
    staleTime: SETTLED_STALE_MS,
    queryFn: async (): Promise<IssuePin[]> => {
      const { data, error } = await supabase.from('issue_pins').select(PIN_COLUMNS).eq('team_id', teamId).order('position').order('created_at')
      if (error) throw toDataError('load your starred items', error)
      return data
    },
  })

/** The issues you starred (the sidebar needs their IDs, titles and status). */
export const starredIssuesQuery = (issueIds: string[]) =>
  queryOptions({
    // Under the pins prefix, so a change to your stars refreshes it; NOT_LIVE (lib/live) for the titles.
    queryKey: ['issues', 'pins', 'issues', [...issueIds].sort().join(',')] as const,
    enabled: issueIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('issues')
        .select('id, number, title, status, workspace_id, workspace:workspaces!issues_workspace_team_fkey(issue_key)')
        .in('id', issueIds)
      if (error) throw toDataError('load starred issues', error)
      return data
    },
  })

/** The sprints you starred point at (the sidebar needs their numbers and names). */
export const pinnedCyclesQuery = (cycleIds: string[]) =>
  queryOptions({
    // Under the pins prefix, so a change to pins or cycles refreshes it.
    queryKey: ['issues', 'pins', 'cycles', [...cycleIds].sort().join(',')] as const,
    enabled: cycleIds.length > 0,
    queryFn: async (): Promise<IssueCycle[]> => {
      const { data, error } = await supabase.from('issue_cycles').select('id, workspace_id, number, name, starts_on, ends_on').in('id', cycleIds)
      if (error) throw toDataError('load pinned sprints', error)
      return data
    },
  })

export async function createView(input: { workspaceId: string; name: string; shared: boolean; state: ViewState }): Promise<IssueView> {
  // Generated types can't see the insert trigger that fills team_id.
  const row: Omit<TablesInsert<'issue_views'>, 'team_id'> = {
    workspace_id: input.workspaceId,
    name: input.name.trim(),
    shared: input.shared,
    layout: input.state.layout,
    tab: input.state.tab,
    filters: serializeFilters(input.state.filters),
  }
  const { data, error } = await supabase
    .from('issue_views')
    .insert(row as TablesInsert<'issue_views'>)
    .select(VIEW_COLUMNS)
    .single()
  if (error) throw toDataError('save the view', error, viewErrors)
  return data
}

export type ViewPatch = { name?: string; shared?: boolean; state?: ViewState }

export async function updateView(id: string, patch: ViewPatch) {
  const { data, error } = await supabase
    .from('issue_views')
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.shared !== undefined ? { shared: patch.shared } : {}),
      ...(patch.state ? { layout: patch.state.layout, tab: patch.state.tab as IssueTab, filters: serializeFilters(patch.state.filters) } : {}),
    })
    .eq('id', id)
    .select('id')
  if (error) throw toDataError('save the view', error, viewErrors)
  requireAffected(data, 'update view')
}

export async function deleteView(id: string) {
  const { data, error } = await supabase.from('issue_views').delete().eq('id', id).select('id')
  if (error) throw toDataError('delete the view', error)
  requireAffected(data, 'delete view')
}

export type PinTarget =
  | { kind: 'view'; viewId: string }
  | { kind: 'person'; personId: string }
  | { kind: 'tab'; tab: IssueTab }
  | { kind: 'cycle'; cycleId: string }
  /** Whichever cycle is running now. */
  | { kind: 'current_cycle' }

export async function pinTarget(workspaceId: string, target: PinTarget) {
  const row: Omit<TablesInsert<'issue_pins'>, 'team_id'> = {
    workspace_id: workspaceId,
    kind: target.kind,
    ...(target.kind === 'view' ? { view_id: target.viewId } : {}),
    ...(target.kind === 'person' ? { person_id: target.personId } : {}),
    ...(target.kind === 'tab' ? { tab: target.tab } : {}),
    ...(target.kind === 'cycle' ? { cycle_id: target.cycleId } : {}),
  }
  const { error } = await supabase.from('issue_pins').insert(row as TablesInsert<'issue_pins'>)
  if (error) throw toDataError('star it', error, { '23505': 'That is already starred.', '23514': 'That person isn’t in this group.', '54000': 'You can star at most 30 items.' })
}

/** Stars that aren't one project's issue views: a workspace, an issue, a plan, or the Issues hub's My issues. */
export type StarTarget = { kind: 'workspace'; workspaceId: string } | { kind: 'issue'; issueId: string } | { kind: 'plan'; planId: string } | { kind: 'my_issues' }

/**
 * The group comes from the workspace, issue or plan (or is the given one, for My issues); see
 * prepare_issue_pin. `id` is chosen by the caller, so the star can be shown (and unstarred) at once.
 */
export async function addStar(teamId: string, target: StarTarget, id: string) {
  const row: Partial<TablesInsert<'issue_pins'>> = {
    id,
    kind: target.kind,
    team_id: teamId,
    ...(target.kind === 'workspace' ? { workspace_id: target.workspaceId } : {}),
    ...(target.kind === 'issue' ? { issue_id: target.issueId } : {}),
    ...(target.kind === 'plan' ? { plan_id: target.planId } : {}),
  }
  const { error } = await supabase.from('issue_pins').insert(row as TablesInsert<'issue_pins'>)
  if (error) throw toDataError('star it', error, { '23505': 'That is already starred.', '54000': 'You can star at most 30 items.' })
}

export function starMatches(pin: IssuePin, target: StarTarget) {
  if (target.kind === 'workspace') return pin.kind === 'workspace' && pin.workspace_id === target.workspaceId
  if (target.kind === 'issue') return pin.kind === 'issue' && pin.issue_id === target.issueId
  if (target.kind === 'plan') return pin.kind === 'plan' && pin.plan_id === target.planId
  return pin.kind === 'my_issues'
}

export async function unpin(pinId: string) {
  const { error } = await supabase.from('issue_pins').delete().eq('id', pinId)
  if (error) throw toDataError('unstar it', error)
}

export async function reorderPins(teamId: string, ids: string[]) {
  const { error } = await supabase.rpc('reorder_issue_pins', { p_team_id: teamId, p_ids: ids })
  if (error) throw toDataError('reorder your starred items', error)
}

/** Does this pin point at the given target? (A pin is one of view / person / tab, per workspace.) */
export function pinMatches(pin: IssuePin, workspaceId: string, target: PinTarget) {
  if (target.kind === 'view') return pin.kind === 'view' && pin.view_id === target.viewId
  if (target.kind === 'cycle') return pin.kind === 'cycle' && pin.cycle_id === target.cycleId
  if (pin.workspace_id !== workspaceId) return false
  if (target.kind === 'current_cycle') return pin.kind === 'current_cycle'
  return target.kind === 'person' ? pin.kind === 'person' && pin.person_id === target.personId : pin.kind === 'tab' && pin.tab === target.tab
}
