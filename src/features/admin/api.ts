import { queryOptions } from '@tanstack/react-query'
import type { TeamType } from '@/features/teams/api'
import { toDataError } from '@/lib/errors'
import { SETTLED_STALE_MS } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'

/**
 * The platform admin console (/admin). Everything here goes through the admin_* database functions,
 * which refuse anyone who isn't a platform admin and return counts, names and dates only: never what
 * a group wrote. Keys live under ['admin'], which no live update touches (the console refetches on
 * open and after its own changes).
 */

export type AdminOverview = {
  users: number
  active_7d: number
  active_30d: number
  new_30d: number
  groups: number
  workspaces: number
  users_no_group: number
  signups_by_week: { week: string; count: number }[]
}

export type AdminGroup = {
  id: string
  name: string
  slug: string
  type: TeamType
  created_at: string
  owner_name: string | null
  owner_email: string | null
  member_count: number
  workspace_count: number
  last_activity: string | null
  enabled_features: string[]
}

export type AdminUser = {
  id: string
  display_name: string | null
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  is_platform_admin: boolean
  groups: { id: string; name: string; role: string }[]
}

export type AdminFlag = {
  key: string
  description: string
  default_enabled: boolean
  updated_at: string
  /** Groups with their own setting; every other group follows the default. */
  overrides: { team_id: string; enabled: boolean }[]
}

export type AdminFeedback = {
  id: string
  kind: 'problem' | 'idea' | 'other'
  message: string
  page: string | null
  context: { browser?: string; screen?: string; theme?: string }
  status: 'new' | 'done'
  created_at: string
  done_at: string | null
  sender_id: string | null
  sender_name: string | null
  sender_email: string | null
  team_name: string | null
}

export const adminKeys = {
  me: (userId: string) => ['admin', 'me', userId] as const,
  overview: ['admin', 'overview'] as const,
  groups: ['admin', 'groups'] as const,
  users: ['admin', 'users'] as const,
  flags: ['admin', 'flags'] as const,
  feedback: ['admin', 'feedback'] as const,
}

/** Is the signed-in person a platform admin? Asked only where it matters (no groups, /admin). */
export const amPlatformAdminQuery = (userId: string) =>
  queryOptions({
    queryKey: adminKeys.me(userId),
    staleTime: SETTLED_STALE_MS,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('am_platform_admin')
      if (error) throw toDataError('check your account', error)
      return data === true
    },
  })

export const adminOverviewQuery = () =>
  queryOptions({
    queryKey: adminKeys.overview,
    queryFn: async (): Promise<AdminOverview> => {
      const { data, error } = await supabase.rpc('admin_overview')
      if (error) throw toDataError('load the overview', error)
      return data as unknown as AdminOverview
    },
  })

export const adminGroupsQuery = () =>
  queryOptions({
    queryKey: adminKeys.groups,
    queryFn: async (): Promise<AdminGroup[]> => {
      const { data, error } = await supabase.rpc('admin_groups')
      if (error) throw toDataError('load the groups', error)
      // The generated types can't tell which returned columns may be null.
      return data as AdminGroup[]
    },
  })

export const adminUsersQuery = () =>
  queryOptions({
    queryKey: adminKeys.users,
    queryFn: async (): Promise<AdminUser[]> => {
      const { data, error } = await supabase.rpc('admin_users')
      if (error) throw toDataError('load the users', error)
      return data as unknown as AdminUser[]
    },
  })

export const adminFlagsQuery = () =>
  queryOptions({
    queryKey: adminKeys.flags,
    queryFn: async (): Promise<AdminFlag[]> => {
      const { data, error } = await supabase.rpc('admin_feature_flags')
      if (error) throw toDataError('load the feature flags', error)
      return data as unknown as AdminFlag[]
    },
  })

export async function setFlagDefault(key: string, enabled: boolean) {
  const { error } = await supabase.rpc('admin_set_flag_default', { p_key: key, p_enabled: enabled })
  if (error) throw toDataError('change the flag', error, { P0002: 'That flag no longer exists. Reload the page.' })
}

/** `enabled` null: the group follows the flag's default again. */
export async function setTeamFlag(teamId: string, key: string, enabled: boolean | null) {
  const { error } = await supabase.rpc('admin_set_team_flag', {
    p_team: teamId,
    p_key: key,
    // The function takes null to clear the group's own setting; the generated type says boolean.
    p_enabled: enabled as boolean,
  })
  if (error) throw toDataError('change the flag', error, { P0002: 'That group or flag no longer exists. Reload the page.' })
}

/** Feedback sent from the profile menu (Send feedback), newest first (the latest 500). The console's tab counts the new ones. */
export const adminFeedbackQuery = () =>
  queryOptions({
    queryKey: adminKeys.feedback,
    queryFn: async (): Promise<AdminFeedback[]> => {
      const { data, error } = await supabase.rpc('admin_feedback')
      if (error) throw toDataError('load the feedback', error)
      return data as unknown as AdminFeedback[]
    },
  })

export async function setFeedbackStatus(id: string, status: 'new' | 'done') {
  const { error } = await supabase.rpc('admin_set_feedback_status', { p_id: id, p_status: status })
  if (error) throw toDataError('update the feedback', error, { P0002: 'That feedback no longer exists. Reload the page.' })
}
