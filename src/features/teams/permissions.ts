import {
  BookOpen,
  Code2,
  FolderKanban,
  GraduationCap,
  LayoutGrid,
  Shapes,
  type LucideIcon,
} from 'lucide-react'
import type { WorkspaceRole, WorkspaceType } from '@/features/workspaces/api'
import type { TeamRole, TeamType } from './api'

// What the UI should offer. These mirror the RLS policies but are UX only:
// the database is the authority, and every call is checked there again.

export function teamPermissions(role: TeamRole) {
  const isOwner = role === 'owner'
  const isAdmin = isOwner || role === 'admin'
  return {
    isOwner,
    isAdmin,
    canManageWorkspaces: isAdmin,
    canInvite: isAdmin,
    canEditTeam: isAdmin,
    canDelete: isOwner,
    canChangeRoles: isOwner,
    canLeave: !isOwner,
    /** Owner removes anyone else; admin removes plain members. */
    canRemove: (target: TeamRole) => target !== 'owner' && (isOwner || (role === 'admin' && target === 'member')),
  }
}

export function workspacePermissions(teamRole: TeamRole, workspaceRole: WorkspaceRole | undefined) {
  const isTeamAdmin = teamRole === 'owner' || teamRole === 'admin'
  const isLead = workspaceRole === 'lead'
  return {
    canEdit: isTeamAdmin || isLead,
    canDelete: isTeamAdmin,
    canAddMembers: isTeamAdmin || isLead,
    /** Only team owners/admins can make someone a lead. */
    canAssignLeads: isTeamAdmin,
    canRemove: (target: WorkspaceRole) => isTeamAdmin || (isLead && target === 'member'),
  }
}

export const teamRoleLabel: Record<TeamRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }
export const workspaceRoleLabel: Record<WorkspaceRole, string> = { lead: 'Lead', member: 'Member' }

export const teamTypes: Record<TeamType, { label: string; hint: string; icon: LucideIcon }> = {
  learning: { label: 'Learning', hint: 'Courses, cohorts, study groups', icon: GraduationCap },
  development: { label: 'Development', hint: 'Projects and code', icon: Code2 },
  general: { label: 'General', hint: 'Anything else', icon: Shapes },
}

export const workspaceTypes: Record<
  WorkspaceType,
  /** `noun` is what one is called in copy ("New course"), `plural` heads its sidebar section. */
  { label: string; noun: string; plural: string; hint: string; icon: LucideIcon }
> = {
  course: { label: 'Course', noun: 'course', plural: 'Courses', hint: 'Lessons, live classes, docs', icon: BookOpen },
  project: { label: 'Project', noun: 'project', plural: 'Projects', hint: 'Code, docs, and planning', icon: FolderKanban },
  // The 'general' type is called a "space" in the UI (study groups, clubs, anything else).
  general: { label: 'Space', noun: 'space', plural: 'Spaces', hint: 'Study groups, discussions, anything else', icon: LayoutGrid },
}

/**
 * What a group can contain, by group type (mirrors private.check_workspace_type):
 * development groups have no courses.
 */
export const allowedWorkspaceTypes: Record<TeamType, WorkspaceType[]> = {
  learning: ['course', 'project', 'general'],
  development: ['project', 'general'],
  general: ['course', 'project', 'general'],
}

/**
 * Sidebar section order: the team type's own workspace type first, then the
 * rest (only types the group can contain).
 */
export function workspaceTypeOrder(teamType: TeamType): WorkspaceType[] {
  const first = defaultWorkspaceType[teamType]
  return [first, ...allowedWorkspaceTypes[teamType].filter((t) => t !== first)]
}

/** Sensible default workspace type for a team of this type. */
export const defaultWorkspaceType: Record<TeamType, WorkspaceType> = {
  learning: 'course',
  development: 'project',
  general: 'general',
}
