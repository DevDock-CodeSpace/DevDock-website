import {
  BookOpen,
  CircleDot,
  FileText,
  FolderGit2,
  GitPullRequest,
  Home,
  LayoutDashboard,
  Settings,
  Shapes,
  Users,
  Video,
  Workflow,
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

/** Sidebar team links (the workspace list sits between Home and Members). */
export function getTeamNav(slug: string): { home: NavItem; members: NavItem; settings: NavItem } {
  const base = teamPath(slug)
  return {
    home: { title: 'Home', to: base, icon: Home, end: true },
    members: { title: 'Members', to: `${base}/members`, icon: Users },
    settings: { title: 'Settings', to: `${base}/settings`, icon: Settings },
  }
}

// ------------------------------------------------------------ workspace tabs

export type WorkspaceTabId =
  | 'overview'
  | 'learning'
  | 'docs'
  | 'diagrams'
  | 'exercises'
  | 'resources'
  | 'issues'
  | 'github'
  | 'live'
  | 'members'

export const workspaceTabDefs: Record<WorkspaceTabId, { title: string; icon: LucideIcon; soon?: string }> = {
  overview: { title: 'Overview', icon: LayoutDashboard },
  learning: { title: 'Learning', icon: BookOpen, soon: 'Lessons and learning paths will live here.' },
  docs: { title: 'Docs', icon: FileText, soon: 'Shared documents and notes will live here.' },
  diagrams: { title: 'Diagrams', icon: Workflow, soon: 'diagrams.net boards will live here.' },
  exercises: { title: 'Exercises', icon: Shapes, soon: 'Practice exercises and submissions will live here.' },
  resources: { title: 'Resources', icon: FolderGit2, soon: 'Links, repositories, and files will live here.' },
  issues: { title: 'Issues', icon: CircleDot, soon: 'Project issues and tasks will live here.' },
  github: { title: 'GitHub', icon: GitPullRequest, soon: 'Linked repositories and pull requests will show up here.' },
  live: { title: 'Live', icon: Video, soon: 'Live sessions (Jitsi) will start from here.' },
  members: { title: 'Members', icon: Users },
}

const tabsByType: Record<WorkspaceType, WorkspaceTabId[]> = {
  course: ['overview', 'learning', 'docs', 'diagrams', 'exercises', 'resources', 'live', 'members'],
  project: ['overview', 'issues', 'docs', 'diagrams', 'github', 'live', 'members'],
  general: ['overview', 'docs', 'diagrams', 'resources', 'live', 'members'],
}

export function hasWorkspaceTab(type: WorkspaceType, tab: string): tab is WorkspaceTabId {
  return (tabsByType[type] as string[]).includes(tab)
}

/** Horizontal tabs under the workspace title. Overview is the index route. */
export function getWorkspaceTabs(
  teamSlug: string,
  workspaceId: string,
  type: WorkspaceType,
): (NavItem & { id: WorkspaceTabId })[] {
  const base = workspacePath(teamSlug, workspaceId)
  return tabsByType[type].map((id) => ({
    id,
    title: workspaceTabDefs[id].title,
    icon: workspaceTabDefs[id].icon,
    to: id === 'overview' ? base : `${base}/${id}`,
    end: id === 'overview',
  }))
}
