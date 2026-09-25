import { queryOptions } from '@tanstack/react-query'
import type { PersonProfile } from '@/features/teams/api'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Database, Tables, TablesInsert } from '@/types/database.types'

export type WorkspaceRole = Database['public']['Enums']['workspace_role']
export type WorkspaceType = Database['public']['Enums']['workspace_type']
/** Workspace tools. 'resources' is retired in the database (Docs replaced it). */
export type WorkspaceModule = Exclude<Database['public']['Enums']['workspace_module'], 'resources'>
const isActiveModule = (module: Database['public']['Enums']['workspace_module']): module is WorkspaceModule =>
  module !== 'resources'
export type Workspace = Pick<
  Tables<'workspaces'>,
  'id' | 'team_id' | 'title' | 'description' | 'type' | 'issue_key' | 'created_at' | 'updated_at'
> & {
  /** Enabled tools; drives the workspace tabs. */
  modules: WorkspaceModule[]
}
export type WorkspaceSummary = Pick<Tables<'workspaces'>, 'id' | 'title' | 'description' | 'type' | 'updated_at'> & {
  /** Enabled tools (used by the team-level tool pages). */
  modules: WorkspaceModule[]
  memberCount: number
  leads: NonNullable<PersonProfile>[]
}
export type WorkspaceMember = { user_id: string; role: WorkspaceRole; joined_at: string; profile: PersonProfile }

// ---------------------------------------------------------------- queries

/** Workspaces visible to the caller: all of them for team owners/admins, assigned ones otherwise (RLS). */
export const teamWorkspacesQuery = (teamId: string) =>
  queryOptions({
    queryKey: ['workspaces', 'team', teamId],
    queryFn: async (): Promise<WorkspaceSummary[]> => {
      const { data, error } = await supabase
        .from('workspaces')
        .select(
          'id, title, description, type, updated_at, workspace_modules(module), workspace_members(role, profile:profiles(display_name, avatar_url))',
        )
        .eq('team_id', teamId)
        .order('title')
      if (error) throw toDataError('load workspaces', error)
      // Rosters are small (a class or project group), so fetching them beats a second query.
      return data.map(({ workspace_members, workspace_modules, ...workspace }) => ({
        ...workspace,
        modules: workspace_modules.map((m) => m.module).filter(isActiveModule),
        memberCount: workspace_members.length,
        leads: workspace_members
          .filter((m) => m.role === 'lead')
          .map((m) => m.profile)
          .filter((p): p is NonNullable<PersonProfile> => p !== null),
      }))
    },
  })

/** The caller's role in each workspace of a team they're assigned to. */
export const myWorkspaceRolesQuery = (teamId: string, userId: string) =>
  queryOptions({
    queryKey: ['workspaces', 'team', teamId, 'my-roles', userId],
    queryFn: async (): Promise<Record<string, WorkspaceRole>> => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('team_id', teamId)
        .eq('user_id', userId)
      if (error) throw toDataError('load your workspace roles', error)
      return Object.fromEntries(data.map((row) => [row.workspace_id, row.role]))
    },
  })

/** null when the workspace doesn't exist or the caller can't see it. */
export const workspaceQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId],
    queryFn: async (): Promise<Workspace | null> => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, team_id, title, description, type, issue_key, created_at, updated_at, workspace_modules(module)')
        .eq('id', workspaceId)
        .maybeSingle()
      if (error) throw toDataError('load the workspace', error)
      if (!data) return null
      const { workspace_modules, ...workspace } = data
      return { ...workspace, modules: workspace_modules.map((m) => m.module).filter(isActiveModule) }
    },
  })

export const workspaceMembersQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'members'],
    queryFn: async (): Promise<WorkspaceMember[]> => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('user_id, role, joined_at, profile:profiles(display_name, avatar_url)')
        .eq('workspace_id', workspaceId)
        .order('joined_at')
      if (error) throw toDataError('load workspace members', error)
      return data
    },
  })

// -------------------------------------------------------------- mutations

type WorkspaceInput = { title: string; description: string; type: WorkspaceType }

/** Creates the workspace and its enabled tools in one transaction (RPC, runs under RLS). */
export async function createWorkspace(
  teamId: string,
  input: WorkspaceInput & { modules: WorkspaceModule[] },
): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('create_workspace', {
    p_team_id: teamId,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_type: input.type,
    p_modules: input.modules,
  })
  if (error) throw toDataError('create it', error, { '23514': 'Development groups can have projects and spaces, not courses.' })
  return { id: data }
}

/** Replaces the workspace's enabled tools (team owner/admin or workspace lead). */
export async function setWorkspaceModules(workspaceId: string, modules: WorkspaceModule[]) {
  const { error } = await supabase.rpc('set_workspace_modules', { p_workspace_id: workspaceId, p_modules: modules })
  if (error) throw toDataError('save the tools', error)
}

export async function updateWorkspace(workspaceId: string, input: WorkspaceInput) {
  const { data, error } = await supabase
    .from('workspaces')
    .update({ title: input.title.trim(), description: input.description.trim() || null, type: input.type })
    .eq('id', workspaceId)
    .select('id')
  if (error) throw toDataError('save it', error, { '23514': 'Development groups can have projects and spaces, not courses.' })
  requireAffected(data, 'update workspace')
}

/** The prefix of issue identifiers (CAP in CAP-12). Workspace managers only (RLS). */
export async function updateIssueKey(workspaceId: string, key: string) {
  const { data, error } = await supabase
    .from('workspaces')
    .update({ issue_key: key.trim().toUpperCase() })
    .eq('id', workspaceId)
    .select('id')
  if (error) {
    throw toDataError('save the issue key', error, {
      '23514': 'Use 2–6 letters or digits, starting with a letter (e.g. CAP).',
    })
  }
  requireAffected(data, 'update issue key')
}

export async function deleteWorkspace(workspaceId: string) {
  const { data, error } = await supabase.from('workspaces').delete().eq('id', workspaceId).select('id')
  if (error) throw toDataError('delete the workspace', error)
  requireAffected(data, 'delete workspace')
}

export async function addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole) {
  // team_id is NOT NULL but always set by a DB trigger from the workspace (clients
  // have no INSERT privilege on it). Generated types can't see triggers, so omit it here.
  const row: Omit<TablesInsert<'workspace_members'>, 'team_id'> = { workspace_id: workspaceId, user_id: userId, role }
  const { error } = await supabase.from('workspace_members').insert(row as TablesInsert<'workspace_members'>)
  if (error) {
    throw toDataError('add the member', error, { '23505': 'They’re already in this workspace.' })
  }
}

export async function setWorkspaceRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  const { data, error } = await supabase
    .from('workspace_members')
    .update({ role })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw toDataError('change the role', error)
  requireAffected(data, 'change workspace role')
}

/** Remove someone, or leave (userId = yourself). */
export async function removeWorkspaceMember(workspaceId: string, userId: string) {
  const { data, error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw toDataError('remove the member', error)
  requireAffected(data, 'remove workspace member')
}

// ------------------------------------------------------------------ pins
// Each person's pinned workspaces (private to them; RLS).

export type WorkspacePin = { workspace_id: string; pinned_at: string }

export const pinsQuery = (userId: string) =>
  queryOptions({
    queryKey: ['workspaces', 'pins', userId],
    queryFn: async (): Promise<WorkspacePin[]> => {
      const { data, error } = await supabase
        .from('workspace_pins')
        .select('workspace_id, pinned_at')
        .eq('user_id', userId)
        .order('pinned_at')
      if (error) throw toDataError('load your pins', error)
      return data
    },
  })

/** user_id is the caller (database default). */
export async function pinWorkspace(workspaceId: string) {
  const { error } = await supabase.from('workspace_pins').insert({ workspace_id: workspaceId })
  // Already pinned (e.g. in another tab) is fine.
  if (error && error.code !== '23505') throw toDataError('pin it', error)
}

export async function unpinWorkspace(userId: string, workspaceId: string) {
  const { error } = await supabase.from('workspace_pins').delete().eq('user_id', userId).eq('workspace_id', workspaceId)
  if (error) throw toDataError('unpin it', error)
}
