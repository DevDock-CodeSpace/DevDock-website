import {
  BookOpen,
  FolderGit2,
  LayoutDashboard,
  LayoutGrid,
  Settings,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import type { WorkspaceType } from '@/features/workspaces/api'

export type NavItem = {
  title: string
  to: string
  icon: LucideIcon
  /** Match the path exactly (for index routes). */
  end?: boolean
}

export const teamPath = (slug: string) => `/t/${slug}`
export const workspacePath = (teamSlug: string, workspaceId: string) => `/t/${teamSlug}/w/${workspaceId}`

export function getTeamNav(slug: string): NavItem[] {
  const base = teamPath(slug)
  return [
    { title: 'Workspaces', to: base, icon: LayoutGrid, end: true },
    { title: 'Members', to: `${base}/members`, icon: Users },
    { title: 'Settings', to: `${base}/settings`, icon: Settings },
  ]
}

export function getWorkspaceNav(teamSlug: string, workspaceId: string, type: WorkspaceType): NavItem[] {
  const base = workspacePath(teamSlug, workspaceId)
  return [
    { title: 'Overview', to: base, icon: LayoutDashboard, end: true },
    // Lessons only make sense for courses.
    ...(type === 'course' ? [{ title: 'Lessons', to: `${base}/lessons`, icon: BookOpen }] : []),
    { title: 'Live Session', to: `${base}/live`, icon: Video },
    { title: 'Resources', to: `${base}/resources`, icon: FolderGit2 },
    { title: 'Members', to: `${base}/members`, icon: Users },
    { title: 'Settings', to: `${base}/settings`, icon: Settings },
  ]
}
