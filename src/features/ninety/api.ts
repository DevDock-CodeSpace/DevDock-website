import { queryOptions } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { DataError, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

// Ninety (EOS) sync, phase 1 (docs/NINETY.md): a group's sprint issues become Ninety To-Dos. Behind the
// ninety_sync feature flag; group owners/admins connect it in Group settings → Ninety. The token goes
// to the ninety-sync function, which keeps it in Vault: the browser never reads it back. Keys under
// ['ninety', …] are not live (the tables aren't published): the section refetches after its own
// changes and when opened.

export type NinetyConnection = {
  team_id: string
  ninety_owner_name: string | null
  token_hint: string
  connected_at: string
  last_sync_at: string | null
  last_error: string | null
  last_error_at: string | null
  /** The Ninety team that gets the group's Rocks (from its plans); null = no Rocks. */
  rocks_ninety_team_id: string | null
  rocks_ninety_team_name: string | null
}

export type NinetyProjectLink = { workspace_id: string; ninety_team_id: string; ninety_team_name: string }
export type NinetyTeam = { id: string; name: string }
export type NinetyStatus = { queued: number; failing: number; todos: number; rocks: number; milestones: number; ids: number; last_failure: string | null }

export const ninetyKeys = {
  all: (teamId: string) => ['ninety', teamId] as const,
  connection: (teamId: string) => ['ninety', teamId, 'connection'] as const,
  links: (teamId: string) => ['ninety', teamId, 'links'] as const,
  status: (teamId: string) => ['ninety', teamId, 'status'] as const,
  teams: (teamId: string) => ['ninety', teamId, 'teams'] as const,
  overview: (teamId: string) => ['ninety', teamId, 'overview'] as const,
}

export const ninetyConnectionQuery = (teamId: string) =>
  queryOptions({
    queryKey: ninetyKeys.connection(teamId),
    queryFn: async (): Promise<NinetyConnection | null> => {
      const { data, error } = await supabase
        .from('ninety_connections')
        .select('team_id, ninety_owner_name, token_hint, connected_at, last_sync_at, last_error, last_error_at, rocks_ninety_team_id, rocks_ninety_team_name')
        .eq('team_id', teamId)
        .maybeSingle()
      if (error) throw toDataError('load the Ninety connection', error)
      return data
    },
  })

export const ninetyLinksQuery = (teamId: string) =>
  queryOptions({
    queryKey: ninetyKeys.links(teamId),
    queryFn: async (): Promise<NinetyProjectLink[]> => {
      const { data, error } = await supabase
        .from('ninety_workspace_teams')
        .select('workspace_id, ninety_team_id, ninety_team_name')
        .eq('team_id', teamId)
      if (error) throw toDataError('load the Ninety project links', error)
      return data
    },
  })

export const ninetyStatusQuery = (teamId: string) =>
  queryOptions({
    queryKey: ninetyKeys.status(teamId),
    queryFn: async (): Promise<NinetyStatus> => {
      const { data, error } = await supabase.rpc('ninety_status', { p_team: teamId })
      if (error) throw toDataError('load the Ninety sync status', error)
      return data as unknown as NinetyStatus
    },
  })

/** Ninety's teams, asked of Ninety through the function (only once connected). */
export const ninetyTeamsQuery = (teamId: string) =>
  queryOptions({
    queryKey: ninetyKeys.teams(teamId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NinetyTeam[]> => (await invoke<{ teams: NinetyTeam[] }>('teams', { teamId })).teams,
  })

export type NinetySource = { kind: 'issue' | 'plan'; label: string; path: string }
type NinetyItem = { id: string; teamId: string; title: string; owner: string | null; source: NinetySource | null }
export type NinetyOverview =
  | { connected: false }
  | {
      connected: true
      fetchedAt: string
      teams: NinetyTeam[]
      todos: (NinetyItem & { dueDate: string | null; completed: boolean })[]
      rocks: (NinetyItem & {
        dueDate: string | null
        status: string
        quarter: string | null
        completed: boolean
        milestones: (NinetyItem & { dueDate: string | null; done: boolean })[]
      })[]
      issues: (NinetyItem & { completed: boolean; term: string | null })[]
      headlines: (NinetyItem & { createdAt: string | null })[]
      scorecards: {
        teamId: string
        periods: { label: string; start: string }[]
        groups: { name: string; kpis: { title: string; unit: string | null; goal: string | null; scores: (string | null)[] }[] }[]
      }[]
      /** DevDock changes waiting for the next run (twice a day) or Sync now. */
      waiting: number
      projects: { name: string; team: string }[]
      rocksTeam: string | null
      failed: string[]
    }

/**
 * The Ninety page: what is in Ninety right now, read live by the function (one request; it asks Ninety
 * for every part at once). A change made elsewhere in DevDock must show as waiting when the page is opened
 * again (it kept a 2-minute copy before, and Sync now looked as if there was nothing to send), so the page
 * reads again on arrival unless the copy was requested after it was last left (`readBefore`). Staleness
 * by time can't say that: a read that began before the change can answer just as the page reopens.
 * Not live-updated otherwise; the page has a Refresh button.
 */
export const ninetyOverviewQuery = (teamId: string) =>
  queryOptions({
    queryKey: ninetyKeys.overview(teamId),
    staleTime: 0,
    refetchOnMount: false, // the page decides (readBefore)
    queryFn: async () => {
      const requestedAt = Date.now()
      return { ...(await invoke<NinetyOverview>('overview', { teamId })), requestedAt }
    },
  })

const leftAt = new Map<string, number>()
/** The Ninety page was left (unmounted, or navigated away from while still on screen). */
export const markNinetyPageLeft = (teamId: string, at: number) => void leftAt.set(teamId, at)
/** Whether the cached read was requested before the page was last left, so may miss a change made since. */
export const readBefore = (teamId: string, requestedAt: number | undefined) => {
  const left = leftAt.get(teamId)
  return left !== undefined && (requestedAt === undefined || requestedAt < left)
}

export async function connectNinety(teamId: string, token: string): Promise<{ teams: NinetyTeam[]; owner: string }> {
  return invoke('connect', { teamId, token: token.trim(), appUrl: window.location.origin })
}

/** The Ninety page's Sync now: sends what is waiting, for anyone in the group. */
export async function sendNinetyWaiting(teamId: string): Promise<{ sent: number; failed: number; stopped?: string }> {
  return invoke('send', { teamId })
}

export async function syncNinetyNow(teamId: string): Promise<{ sent: number; failed: number; stopped?: string }> {
  return invoke('sync', { teamId })
}

/** `team` null unlinks the project. Its issues are queued either way. */
export async function setProjectNinetyTeam(workspaceId: string, team: NinetyTeam | null) {
  const { error } = await supabase.rpc('ninety_set_workspace_team', {
    p_workspace: workspaceId,
    // null unlinks; the generated types say string.
    p_ninety_team_id: (team?.id ?? null) as string,
    p_ninety_team_name: (team?.name ?? null) as string,
  })
  if (error) throw toDataError('link the project', error, { P0001: 'Connect Ninety first.' })
}

/** Which Ninety team gets the group's Rocks; null stops sending plans (what's in Ninety stays). */
export async function setRocksNinetyTeam(teamId: string, team: NinetyTeam | null) {
  const { error } = await supabase.rpc('ninety_set_rocks_team', {
    p_team: teamId,
    // null: no Rocks; the generated types say string.
    p_ninety_team_id: (team?.id ?? null) as string,
    p_ninety_team_name: (team?.name ?? null) as string,
  })
  if (error) throw toDataError('save where plans go', error, { P0001: 'Connect Ninety first.' })
}

export async function disconnectNinety(teamId: string) {
  const { error } = await supabase.rpc('ninety_disconnect', { p_team: teamId })
  if (error) throw toDataError('disconnect Ninety', error)
}

const ninetyErrors: Record<string, string> = {
  token_rejected: 'Ninety refused that token. Check it was copied in full and hasn’t expired, and that your Ninety plan includes API access.',
  not_enabled: 'Ninety isn’t switched on for this group.',
  forbidden: 'Only group owners and admins can do that.',
  not_connected: 'Connect Ninety first.',
  ninety_error: 'Ninety didn’t answer properly. Try again in a minute.',
  bad_request: 'That token doesn’t look like a Ninety personal access token.',
  unauthorized: 'Your session expired. Sign in again.',
}

async function invoke<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('ninety-sync', { body: { action, ...body } })
  if (error || !data) {
    let code: string | undefined
    if (error instanceof FunctionsHttpError) {
      code = await (error.context as Response)
        .json()
        .then((b: { error?: string }) => b.error)
        .catch(() => undefined)
    }
    console.error(`[ninety] ${action} failed`, code ?? error)
    throw new DataError((code && ninetyErrors[code]) ?? 'Something went wrong talking to Ninety. Please try again.', code, { cause: error })
  }
  return data
}
