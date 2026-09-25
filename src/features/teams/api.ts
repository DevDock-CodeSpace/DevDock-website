import { queryOptions } from '@tanstack/react-query'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Database, Tables } from '@/types/database.types'

export type TeamRole = Database['public']['Enums']['team_role']
export type TeamType = Database['public']['Enums']['team_type']
export type Team = Pick<Tables<'teams'>, 'id' | 'name' | 'slug' | 'type'>
export type TeamMembership = { role: TeamRole; joinedAt: string; team: Team }
export type Invite = Pick<
  Tables<'team_invites'>,
  'id' | 'code' | 'created_at' | 'expires_at' | 'max_uses' | 'use_count'
>
export type PersonProfile = { display_name: string | null; avatar_url: string | null } | null
export type TeamMember = { user_id: string; role: TeamRole; joined_at: string; profile: PersonProfile }

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

// ---------------------------------------------------------------- queries

/** Teams the user belongs to, with their role in each. Empty → onboarding. */
export const myTeamsQuery = (userId: string) =>
  queryOptions({
    queryKey: ['teams', 'mine', userId],
    queryFn: async (): Promise<TeamMembership[]> => {
      const { data, error } = await supabase
        .from('team_members')
        .select('role, joined_at, team:teams(id, name, slug, type)')
        .eq('user_id', userId)
        .order('joined_at')
      if (error) throw toDataError('load your teams', error)
      return data.map((row) => ({ role: row.role, joinedAt: row.joined_at, team: row.team }))
    },
  })

export const teamMembersQuery = (teamId: string) =>
  queryOptions({
    queryKey: ['teams', teamId, 'members'],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase
        .from('team_members')
        .select('user_id, role, joined_at, profile:profiles(display_name, avatar_url)')
        .eq('team_id', teamId)
        .order('joined_at')
      if (error) throw toDataError('load team members', error)
      return data
    },
  })

export const invitesQuery = (teamId: string) =>
  queryOptions({
    queryKey: ['teams', teamId, 'invites'],
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from('team_invites')
        .select('id, code, created_at, expires_at, max_uses, use_count')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
      if (error) throw toDataError('load invites', error)
      return data
    },
  })

// -------------------------------------------------------------- mutations

export async function createTeam(input: { name: string; slug: string; type: TeamType }): Promise<Team> {
  const { data, error } = await supabase
    .from('teams')
    .insert({ name: input.name.trim(), slug: input.slug, type: input.type })
    .select('id, name, slug, type')
    .single()
  if (error) {
    throw toDataError('create the team', error, {
      '23505': 'That team URL is already taken. Try another.',
      '23514': 'Use 3–48 lowercase letters, numbers, and single dashes for the URL.',
    })
  }
  return data
}

/** Returns the joined team's id. Already a member → same id, no error. */
export async function joinTeam(inviteCode: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_team', { invite_code: inviteCode })
  if (error) {
    throw toDataError('join the team', error, {
      P0001: 'That invite code is invalid, expired, or has no uses left.',
    })
  }
  return data
}

export async function updateTeam(teamId: string, input: { name: string; type: TeamType }) {
  const { data, error } = await supabase
    .from('teams')
    .update({ name: input.name.trim(), type: input.type })
    .eq('id', teamId)
    .select('id')
  if (error) throw toDataError('save the team', error)
  requireAffected(data, 'update team')
}

export async function deleteTeam(teamId: string) {
  const { data, error } = await supabase.from('teams').delete().eq('id', teamId).select('id')
  if (error) throw toDataError('delete the team', error)
  requireAffected(data, 'delete team')
}

export async function setTeamRole(teamId: string, userId: string, role: Exclude<TeamRole, 'owner'>) {
  const { data, error } = await supabase
    .from('team_members')
    .update({ role })
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw toDataError('change the role', error)
  requireAffected(data, 'change team role')
}

/** Remove someone, or leave (userId = yourself). Also removes them from the team's workspaces. */
export async function removeTeamMember(teamId: string, userId: string) {
  const { data, error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw toDataError('remove the member', error)
  requireAffected(data, 'remove team member')
}

export async function createInvite(
  teamId: string,
  options: { expiresAt: string | null; maxUses: number | null },
): Promise<Invite> {
  const { data, error } = await supabase
    .from('team_invites')
    .insert({ team_id: teamId, expires_at: options.expiresAt, max_uses: options.maxUses })
    .select('id, code, created_at, expires_at, max_uses, use_count')
    .single()
  if (error) throw toDataError('create the invite', error)
  return data
}

export async function revokeInvite(inviteId: string) {
  const { data, error } = await supabase.from('team_invites').delete().eq('id', inviteId).select('id')
  if (error) throw toDataError('revoke the invite', error)
  requireAffected(data, 'revoke invite')
}
