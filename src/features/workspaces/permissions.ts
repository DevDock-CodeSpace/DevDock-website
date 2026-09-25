import type { CourseRole } from '@/features/courses/api'
import type { WorkspaceRole } from './api'

// What the UI should offer. These mirror the RLS policies but are UX only:
// the database is the authority, and every call is checked there again.

export function workspacePermissions(role: WorkspaceRole) {
  const isOwner = role === 'owner'
  const isAdmin = isOwner || role === 'admin'
  return {
    isOwner,
    isAdmin,
    canManageCourses: isAdmin,
    canInvite: isAdmin,
    canRename: isAdmin,
    canDelete: isOwner,
    canChangeRoles: isOwner,
    canLeave: !isOwner,
    /** Owner removes anyone else; admin removes plain members. */
    canRemove: (target: WorkspaceRole) =>
      target !== 'owner' && (isOwner || (role === 'admin' && target === 'member')),
  }
}

export function coursePermissions(workspaceRole: WorkspaceRole, courseRole: CourseRole | undefined) {
  const isAdmin = workspaceRole === 'owner' || workspaceRole === 'admin'
  const isLead = courseRole === 'lead'
  return {
    canEdit: isAdmin || isLead,
    canDelete: isAdmin,
    canAddMembers: isAdmin || isLead,
    /** Only workspace owners/admins can make someone a lead. */
    canAssignLeads: isAdmin,
    canRemove: (target: CourseRole) => isAdmin || (isLead && target === 'member'),
  }
}

export const workspaceRoleLabel: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

export const courseRoleLabel: Record<CourseRole, string> = {
  lead: 'Lead',
  member: 'Member',
}
