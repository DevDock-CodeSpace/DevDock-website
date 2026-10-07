import { useQuery } from '@tanstack/react-query'
import { Fragment, type CSSProperties } from 'react'
import { Link, matchPath, Outlet, useLocation, useParams } from 'react-router'
import { AppSidebar } from '@/components/AppSidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NotificationBell } from '@/features/messaging/components/NotificationBell'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { diagramQuery } from '@/features/diagrams/api'
import { liveSessionQuery } from '@/features/live/api'
import { CallDock, LiveCallProvider } from '@/features/live/call/CallDock'
import { documentQuery } from '@/features/docs/api'
import { issueQuery } from '@/features/issues/api'
import { lessonQuery } from '@/features/learning/api'
import { issueIdentifier } from '@/features/issues/meta'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { getTeamNav, getWorkspaceTabs, teamPath, workspacePath, type NavItem } from '@/features/teams/nav'
import { workspaceQuery } from '@/features/workspaces/api'
import { useRealtimeSync } from '@/hooks/use-realtime-sync'
import { useSidebarWidth } from '@/hooks/use-sidebar-width'
import { useFullBleed } from './full-bleed'
import { PageArea } from './PageArea'

// The shadcn sidebar writes its open/collapsed state to this cookie but doesn't read it back.
const sidebarStartsOpen = () => !document.cookie.includes('sidebar_state=false')

/** Team shell: sidebar + header + page. Rendered for /t/:teamSlug/*. */
export function AppLayout() {
  useRealtimeSync()
  return (
    <LiveCallProvider>
      <AppShell />
      {/* Keeps an active call alive across navigation (docks on the session page, floats elsewhere). */}
      <CallDock />
    </LiveCallProvider>
  )
}

function AppShell() {
  const { workspaceId } = useParams()
  const fullBleed = useFullBleed()
  const sidebarWidth = useSidebarWidth()
  return (
    // --sidebar-width is what every part of the sidebar (and the page beside it) is sized from.
    <SidebarProvider defaultOpen={sidebarStartsOpen()} style={{ '--sidebar-width': `${sidebarWidth.width}px` } as CSSProperties}>
      <AppSidebar sidebarWidth={sidebarWidth} />
      {/* min-w-0: wide content (the issue board) scrolls inside the page instead of widening it. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-center" />
          {workspaceId ? <WorkspaceBreadcrumb /> : <TeamBreadcrumb />}
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        <PageArea fullBleed={fullBleed}>
          <Outlet />
        </PageArea>
      </SidebarInset>
    </SidebarProvider>
  )
}

type Crumb = { label: string; to: string }

function TeamBreadcrumb() {
  const { team } = useCurrentTeam()
  const { tools, members, settings, messages } = getTeamNav(team.slug, team.type)
  const section = useSection([messages, ...tools, members, settings])
  const item = useItemCrumb()
  return <Crumbs crumbs={[{ label: team.name, to: teamPath(team.slug) }, ...section, ...item]} />
}

function WorkspaceBreadcrumb() {
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()
  const base = workspacePath(team.slug, workspace.id)
  const section = useSection([
    ...getWorkspaceTabs(team.slug, workspace.id, workspace.modules),
    { title: 'Settings', to: `${base}/settings`, icon: getTeamNav(team.slug).settings.icon },
  ])
  const item = useItemCrumb()
  return (
    <Crumbs
      crumbs={[
        { label: team.name, to: teamPath(team.slug) },
        { label: workspace.title, to: workspacePath(team.slug, workspace.id) },
        ...section,
        ...item,
      ]}
    />
  )
}

/**
 * On a doc, diagram, live session or issue page, its title (issue: identifier) as the last
 * crumb, but only where its loader would show it (same team/workspace).
 */
function useItemCrumb(): Crumb[] {
  const { docId, diagramId, sessionId, issueNumber, cycleNumber, lessonId, workspaceId } = useParams()
  const { pathname } = useLocation()
  const { team } = useCurrentTeam()
  const doc = useQuery({ ...documentQuery(docId ?? ''), enabled: docId !== undefined }).data
  const diagram = useQuery({ ...diagramQuery(diagramId ?? ''), enabled: diagramId !== undefined }).data
  const session = useQuery({ ...liveSessionQuery(sessionId ?? ''), enabled: sessionId !== undefined }).data
  const issue = useQuery({
    ...issueQuery(workspaceId ?? '', Number(issueNumber)),
    enabled: issueNumber !== undefined && workspaceId !== undefined,
  }).data
  const workspace = useQuery({ ...workspaceQuery(workspaceId ?? ''), enabled: workspaceId !== undefined }).data
  const lesson = useQuery({ ...lessonQuery(lessonId ?? ''), enabled: lessonId !== undefined }).data
  if (lessonId && lesson && lesson.workspace_id === workspaceId) return [{ label: lesson.title, to: pathname }]
  if (workspaceId && pathname.endsWith('/learning/progress')) return [{ label: 'Class progress', to: pathname }]
  if (issueNumber && issue && workspace) {
    return [{ label: issueIdentifier(workspace.issue_key, issue.number), to: pathname }]
  }
  if (workspaceId && pathname.includes('/issues/cycles')) {
    const cycles = `${pathname.split('/issues/cycles')[0]}/issues/cycles`
    return [
      { label: 'Cycles', to: cycles },
      ...(cycleNumber ? [{ label: `Cycle ${cycleNumber}`, to: pathname }] : []),
    ]
  }
  const item = docId ? doc : diagramId ? diagram : sessionId ? session : undefined
  const belongs =
    item && item.team_id === team.id && (workspaceId === undefined || item.workspace_id === workspaceId)
  return belongs ? [{ label: item.title, to: pathname }] : []
}

/** The current non-index nav item as a crumb, if any. */
function useSection(items: NavItem[]): Crumb[] {
  const { pathname } = useLocation()
  const item = items.find((i) => !i.end && matchPath({ path: i.to, end: false }, pathname))
  return item ? [{ label: item.title, to: item.to }] : []
}

function Crumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, i) => (
          <Fragment key={crumb.to}>
            {i > 0 && <BreadcrumbSeparator className="hidden sm:block" />}
            <BreadcrumbItem className={i < crumbs.length - 1 ? 'hidden min-w-0 sm:inline-flex' : 'min-w-0'}>
              {i === crumbs.length - 1 ? (
                <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild className="truncate">
                  <Link to={crumb.to}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
