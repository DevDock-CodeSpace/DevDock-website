import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { courseQuery, myCourseRolesQuery } from '@/features/courses/api'
import { useAuth } from '@/features/auth/hooks'
import { myWorkspacesQuery } from './api'
import { workspacePath } from './nav'
import { coursePermissions, workspacePermissions } from './permissions'

/** All of the user's workspace memberships (for the switcher). */
export function useMyWorkspaces() {
  const { user } = useAuth()
  return useSuspenseQuery(myWorkspacesQuery(user.id)).data
}

/** The workspace in the URL, the user's role in it, and what that role allows. */
export function useCurrentWorkspace() {
  const { workspaceSlug } = useParams()
  const membership = useMyWorkspaces().find((m) => m.workspace.slug === workspaceSlug)
  if (!membership) throw new Error('useCurrentWorkspace must be used under /w/:workspaceSlug')
  return {
    workspace: membership.workspace,
    role: membership.role,
    can: workspacePermissions(membership.role),
  }
}

/** The course in the URL, the user's role in it (if any), and what they may do. */
export function useCurrentCourse() {
  const { courseId } = useParams()
  const { user } = useAuth()
  const { workspace, role: workspaceRole } = useCurrentWorkspace()
  const course = useSuspenseQuery(courseQuery(courseId ?? '')).data
  const myRoles = useSuspenseQuery(myCourseRolesQuery(workspace.id, user.id)).data
  if (!course) throw new Error('useCurrentCourse must be used under a loaded course route')
  const courseRole = myRoles[course.id]
  return { course, courseRole, can: coursePermissions(workspaceRole, courseRole) }
}

/**
 * After leaving or deleting a workspace: go somewhere valid *first*, then
 * refresh. Refreshing first would unmount-crash the current page (its workspace
 * vanishes); navigating to /app first could bounce back via the stale cache.
 */
export function useExitWorkspace() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return async (workspaceId: string) => {
    const cached = queryClient.getQueryData(myWorkspacesQuery(user.id).queryKey) ?? []
    const next = cached.find((m) => m.workspace.id !== workspaceId)
    await navigate(next ? workspacePath(next.workspace.slug) : '/onboarding', { replace: true })
    queryClient.removeQueries({ queryKey: ['courses', 'workspace', workspaceId] })
    await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
  }
}
