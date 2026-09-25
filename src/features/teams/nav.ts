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
import type { WorkspaceModule, WorkspaceType } from '@/features/workspaces/api'

export type NavItem = {
  title: string
  to: string
  icon: LucideIcon
  /** Match the path exactly (for index routes). */
  end?: boolean
}

export const teamPath = (slug: string) => `/t/${slug}`
export const workspacePath = (teamSlug: string, workspaceId: string) => `/t/${teamSlug}/w/${workspaceId}`

/** Docs list, in the team view or inside a workspace. */
export const docsPath = (teamSlug: string, workspaceId?: string) =>
  workspaceId ? `${workspacePath(teamSlug, workspaceId)}/docs` : `${teamPath(teamSlug)}/docs`
/** One doc, opened from the team view or from inside its workspace. */
export const docPath = (teamSlug: string, docId: string, workspaceId?: string) =>
  `${docsPath(teamSlug, workspaceId)}/${docId}`

// ------------------------------------------------------------ team tools
// Team-wide views of the same data a workspace tab shows. Future rows carry
// team_id (required) + workspace_id (optional): null = team-wide, X = assigned
// to workspace X. Team → Docs lists everything the caller can access; a
// workspace's Docs tab lists only rows with that workspace_id. Workspace-only
// tools (Issues, Learning, Exercises, GitHub) have no team view.

export type TeamToolId = Extract<WorkspaceModule, 'docs' | 'diagrams' | 'live'>
export const TEAM_TOOLS: TeamToolId[] = ['docs', 'diagrams', 'live']

export const teamToolDefs: Record<TeamToolId, { item: string; items: string }> = {
  docs: { item: 'doc', items: 'docs' },
  diagrams: { item: 'diagram', items: 'diagrams' },
  live: { item: 'live session', items: 'live sessions' },
}

export function isTeamTool(tool: string): tool is TeamToolId {
  return (TEAM_TOOLS as string[]).includes(tool)
}

/** Sidebar team links: Home + team tools on top, then the workspaces, then Members/Settings. */
export function getTeamNav(slug: string): {
  home: NavItem
  tools: (NavItem & { id: TeamToolId })[]
  members: NavItem
  settings: NavItem
} {
  const base = teamPath(slug)
  return {
    home: { title: 'Home', to: base, icon: Home, end: true },
    tools: TEAM_TOOLS.map((id) => ({
      id,
      title: workspaceTabDefs[id].title,
      icon: workspaceTabDefs[id].icon,
      to: `${base}/${id}`,
    })),
    members: { title: 'Members', to: `${base}/members`, icon: Users },
    settings: { title: 'Settings', to: `${base}/settings`, icon: Settings },
  }
}

// ------------------------------------------------------------ workspace tabs
// Tabs are generated from the workspace's enabled modules (workspace_modules).
// Overview and Members are always present and aren't modules.

export type WorkspaceTabId = 'overview' | WorkspaceModule | 'members'

export const workspaceTabDefs: Record<
  WorkspaceTabId,
  { title: string; icon: LucideIcon; hint?: string; soon?: string }
> = {
  overview: { title: 'Overview', icon: LayoutDashboard },
  learning: { title: 'Learning', icon: BookOpen, hint: 'Lessons and paths', soon: 'Lessons and learning paths will live here.' },
  issues: { title: 'Issues', icon: CircleDot, hint: 'Tasks and bugs', soon: 'Issues and tasks for this workspace will live here.' },
  docs: { title: 'Docs', icon: FileText, hint: 'Pages and notes', soon: 'Docs assigned to this workspace will live here.' },
  diagrams: { title: 'Diagrams', icon: Workflow, hint: 'diagrams.net boards', soon: 'Diagrams assigned to this workspace will live here.' },
  exercises: { title: 'Exercises', icon: Shapes, hint: 'Practice and submissions', soon: 'Exercises and submissions will live here.' },
  github: { title: 'GitHub', icon: GitPullRequest, hint: 'Repos and pull requests', soon: 'Linked repositories and pull requests will show up here.' },
  resources: { title: 'Resources', icon: FolderGit2, hint: 'Links and files', soon: 'Links, repositories, and files will live here.' },
  live: { title: 'Live', icon: Video, hint: 'Sessions (Jitsi)', soon: 'Live sessions for this workspace will start from here.' },
  members: { title: 'Members', icon: Users },
}

/** Canonical tab order, whatever order modules were enabled in. */
export const MODULE_ORDER: WorkspaceModule[] = [
  'learning',
  'issues',
  'docs',
  'diagrams',
  'exercises',
  'github',
  'resources',
  'live',
]

/** Mirrors public.default_workspace_modules() in the database. Defaults only. */
export const defaultModules: Record<WorkspaceType, WorkspaceModule[]> = {
  project: ['issues', 'docs', 'diagrams', 'github', 'live'],
  course: ['learning', 'docs', 'diagrams', 'exercises', 'resources', 'live'],
  general: ['docs', 'diagrams', 'resources', 'live'],
}

export function sortModules(modules: readonly WorkspaceModule[]): WorkspaceModule[] {
  return MODULE_ORDER.filter((m) => modules.includes(m))
}

export function hasWorkspaceTab(modules: readonly WorkspaceModule[], tab: string): tab is WorkspaceModule {
  return (modules as readonly string[]).includes(tab)
}

/** Overview | …enabled modules… | Members. Overview is the index route. */
export function getWorkspaceTabs(
  teamSlug: string,
  workspaceId: string,
  modules: readonly WorkspaceModule[],
): (NavItem & { id: WorkspaceTabId })[] {
  const base = workspacePath(teamSlug, workspaceId)
  const ids: WorkspaceTabId[] = ['overview', ...sortModules(modules), 'members']
  return ids.map((id) => ({
    id,
    title: workspaceTabDefs[id].title,
    icon: workspaceTabDefs[id].icon,
    to: id === 'overview' ? base : `${base}/${id}`,
    end: id === 'overview',
  }))
}
