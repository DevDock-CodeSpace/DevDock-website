import { queryOptions } from '@tanstack/react-query'
import type { PersonProfile } from '@/features/teams/api'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Database, Tables, TablesInsert } from '@/types/database.types'

export type WorkspaceRole = Database['public']['Enums']['workspace_role']
export type WorkspaceType = Database['public']['Enums']['workspace_type']
export type Workspace = Pick<
  Tables<'workspaces'>,
  'id' | 'team_id' | 'title' | 'description' | 'type' | 'created_at' | 'updated_at'
>
export type WorkspaceSummary = Pick<Tables<'workspaces'>, 'id' | 'title' | 'description' | 'type' | 'updated_at'> & {
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
        .select('id, title, description, type, updated_at, workspace_members(role, profile:profiles(display_name, avatar_url))')
        .eq('team_id', teamId)
        .order('title')
      if (error) throw toDataError('load workspaces', error)
      // Rosters are small (a class or project group), so fetching them beats a second query.
      return data.map(({ workspace_members, ...workspace }) => ({
        ...workspace,
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
        .select('id, team_id, title, description, type, created_at, updated_at')
        .eq('id', workspaceId)
        .maybeSingle()
      if (error) throw toDataError('load the workspace', error)
      return data
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

export async function createWorkspace(teamId: string, input: WorkspaceInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      team_id: teamId,
      title: input.title.trim(),
      description: input.description.trim() || null,
      type: input.type,
    })
    .select('id')
    .single()
  if (error) throw toDataError('create the workspace', error)
  return data
}

export async function updateWorkspace(workspaceId: string, input: WorkspaceInput) {
  const { data, error } = await supabase
    .from('workspaces')
    .update({ title: input.title.trim(), description: input.description.trim() || null, type: input.type })
    .eq('id', workspaceId)
    .select('id')
  if (error) throw toDataError('save the workspace', error)
  requireAffected(data, 'update workspace')
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
