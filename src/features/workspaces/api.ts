import { queryOptions } from '@tanstack/react-query'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Database, Tables } from '@/types/database.types'

export type WorkspaceRole = Database['public']['Enums']['workspace_role']
export type Workspace = Pick<Tables<'workspaces'>, 'id' | 'name' | 'slug'>
export type WorkspaceMembership = { role: WorkspaceRole; joinedAt: string; workspace: Workspace }
export type Invite = Pick<
  Tables<'workspace_invites'>,
  'id' | 'code' | 'created_at' | 'expires_at' | 'max_uses' | 'use_count'
>
export type PersonProfile = { display_name: string | null; avatar_url: string | null } | null
export type WorkspaceMember = {
  user_id: string
  role: WorkspaceRole
  joined_at: string
  profile: PersonProfile
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

// ---------------------------------------------------------------- queries

/** Workspaces the user belongs to, with their role in each. Empty → onboarding. */
export const myWorkspacesQuery = (userId: string) =>
  queryOptions({
    queryKey: ['workspaces', 'mine', userId],
    queryFn: async (): Promise<WorkspaceMembership[]> => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('role, joined_at, workspace:workspaces(id, name, slug)')
        .eq('user_id', userId)
        .order('joined_at')
      if (error) throw toDataError('load your workspaces', error)
      return data.map((row) => ({ role: row.role, joinedAt: row.joined_at, workspace: row.workspace }))
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

export const invitesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'invites'],
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from('workspace_invites')
        .select('id, code, created_at, expires_at, max_uses, use_count')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
      if (error) throw toDataError('load invites', error)
      return data
    },
  })

// -------------------------------------------------------------- mutations

export async function createWorkspace(input: { name: string; slug: string }): Promise<Workspace> {
  const { data, error } = await supabase
    .from('workspaces')
    .insert({ name: input.name.trim(), slug: input.slug })
    .select('id, name, slug')
    .single()
  if (error) {
    throw toDataError('create the workspace', error, {
      '23505': 'That workspace URL is already taken. Try another.',
      '23514': 'Use 3–48 lowercase letters, numbers, and single dashes for the URL.',
    })
  }
  return data
}

/** Returns the joined workspace's id. Already a member → same id, no error. */
export async function joinWorkspace(inviteCode: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_workspace', { invite_code: inviteCode })
  if (error) {
    throw toDataError('join the workspace', error, {
      P0001: 'That invite code is invalid, expired, or has no uses left.',
    })
  }
  return data
}

export async function renameWorkspace(workspaceId: string, name: string) {
  const { data, error } = await supabase
    .from('workspaces')
    .update({ name: name.trim() })
    .eq('id', workspaceId)
    .select('id')
  if (error) throw toDataError('rename the workspace', error)
  requireAffected(data, 'rename workspace')
}

export async function deleteWorkspace(workspaceId: string) {
  const { data, error } = await supabase.from('workspaces').delete().eq('id', workspaceId).select('id')
  if (error) throw toDataError('delete the workspace', error)
  requireAffected(data, 'delete workspace')
}

export async function setWorkspaceRole(workspaceId: string, userId: string, role: Exclude<WorkspaceRole, 'owner'>) {
  const { data, error } = await supabase
    .from('workspace_members')
    .update({ role })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw toDataError('change the role', error)
  requireAffected(data, 'change workspace role')
}

/** Remove someone, or leave (userId = yourself). Also removes them from the workspace's courses. */
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

export async function createInvite(
  workspaceId: string,
  options: { expiresAt: string | null; maxUses: number | null },
): Promise<Invite> {
  const { data, error } = await supabase
    .from('workspace_invites')
    .insert({ workspace_id: workspaceId, expires_at: options.expiresAt, max_uses: options.maxUses })
    .select('id, code, created_at, expires_at, max_uses, use_count')
    .single()
  if (error) throw toDataError('create the invite', error)
  return data
}

export async function revokeInvite(inviteId: string) {
  const { data, error } = await supabase.from('workspace_invites').delete().eq('id', inviteId).select('id')
  if (error) throw toDataError('revoke the invite', error)
  requireAffected(data, 'revoke invite')
}
