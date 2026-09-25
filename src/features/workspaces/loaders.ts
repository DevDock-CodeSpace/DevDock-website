import { data, redirect, type LoaderFunctionArgs } from 'react-router'
import { courseQuery, myCourseRolesQuery, workspaceCoursesQuery } from '@/features/courses/api'
import { requireUser } from '@/features/auth/loaders'
import { queryClient } from '@/lib/query-client'
import { myWorkspacesQuery } from './api'
import { lastWorkspace, rememberWorkspace } from './last-workspace'
import { workspacePath } from './nav'

/** /app: send the user to onboarding (no workspaces) or their last/first workspace. */
export async function appIndexLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const memberships = await queryClient.fetchQuery(myWorkspacesQuery(user.id))
  if (memberships.length === 0) throw redirect('/onboarding')
  const last = lastWorkspace()
  const target = memberships.find((m) => m.workspace.slug === last) ?? memberships[0]
  throw redirect(workspacePath(target.workspace.slug))
}

/** /w/:workspaceSlug: must be a member; primes courses for the sidebar and home page. */
export async function workspaceLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const memberships = await queryClient.ensureQueryData(myWorkspacesQuery(user.id))
  const membership = memberships.find((m) => m.workspace.slug === params.workspaceSlug)
  if (!membership) throw data('Workspace not found, or you’re not a member.', { status: 404 })

  rememberWorkspace(membership.workspace.slug)
  await Promise.all([
    queryClient.ensureQueryData(workspaceCoursesQuery(membership.workspace.id)),
    queryClient.ensureQueryData(myCourseRolesQuery(membership.workspace.id, user.id)),
  ])
  return null
}

/** /w/:workspaceSlug/courses/:courseId: visible to workspace admins and course members (RLS). */
export async function courseLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const [memberships, course] = await Promise.all([
    queryClient.ensureQueryData(myWorkspacesQuery(user.id)),
    queryClient.ensureQueryData(courseQuery(params.courseId ?? '')),
  ])
  const workspace = memberships.find((m) => m.workspace.slug === params.workspaceSlug)?.workspace
  if (!course || !workspace || course.workspace_id !== workspace.id) {
    throw data('Course not found, or you don’t have access to it.', { status: 404 })
  }
  return null
}

/** /onboarding: open to everyone signed in (new users, and existing users adding a workspace). */
export async function onboardingLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  await queryClient.ensureQueryData(myWorkspacesQuery(user.id))
  return null
}
