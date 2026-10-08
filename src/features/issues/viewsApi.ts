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
const PIN_COLUMNS = 'id, user_id, team_id, workspace_id, kind, view_id, person_id, tab, cycle_id, position, created_at'

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

/** Your pinned views, people and tabs for the group, in sidebar order. */
export const teamPinsQuery = (teamId: string) =>
  queryOptions({
    queryKey: viewKeys.pins(teamId),
    staleTime: SETTLED_STALE_MS,
    queryFn: async (): Promise<IssuePin[]> => {
      const { data, error } = await supabase.from('issue_pins').select(PIN_COLUMNS).eq('team_id', teamId).order('position').order('created_at')
      if (error) throw toDataError('load pins', error)
      return data
    },
  })

/** The cycles your cycle pins point at (the sidebar needs their numbers and names). */
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
  if (error) throw toDataError('pin it', error, { '23505': 'That is already pinned.', '23514': 'That person isn’t in this group.', '54000': 'You can pin at most 30 items.' })
}

export async function unpin(pinId: string) {
  const { error } = await supabase.from('issue_pins').delete().eq('id', pinId)
  if (error) throw toDataError('unpin it', error)
}

export async function reorderPins(teamId: string, ids: string[]) {
  const { error } = await supabase.rpc('reorder_issue_pins', { p_team_id: teamId, p_ids: ids })
  if (error) throw toDataError('reorder the pins', error)
}

/** Does this pin point at the given target? (A pin is one of view / person / tab, per workspace.) */
export function pinMatches(pin: IssuePin, workspaceId: string, target: PinTarget) {
  if (target.kind === 'view') return pin.kind === 'view' && pin.view_id === target.viewId
  if (target.kind === 'cycle') return pin.kind === 'cycle' && pin.cycle_id === target.cycleId
  if (pin.workspace_id !== workspaceId) return false
  if (target.kind === 'current_cycle') return pin.kind === 'current_cycle'
  return target.kind === 'person' ? pin.kind === 'person' && pin.person_id === target.personId : pin.kind === 'tab' && pin.tab === target.tab
}
