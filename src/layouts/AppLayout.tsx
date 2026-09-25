import { useQuery } from '@tanstack/react-query'
import { Fragment, Suspense } from 'react'
import { Link, matchPath, Outlet, useLocation, useParams } from 'react-router'
import { AppSidebar } from '@/components/AppSidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { diagramQuery } from '@/features/diagrams/api'
import { documentQuery } from '@/features/docs/api'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { getTeamNav, getWorkspaceTabs, teamPath, workspacePath, type NavItem } from '@/features/teams/nav'

// The shadcn sidebar writes its open/collapsed state to this cookie but doesn't read it back.
const sidebarStartsOpen = () => !document.cookie.includes('sidebar_state=false')

/** Team shell: sidebar + header + page. Rendered for /t/:teamSlug/*. */
export function AppLayout() {
  const { workspaceId } = useParams()
  return (
    <SidebarProvider defaultOpen={sidebarStartsOpen()}>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-center" />
          {workspaceId ? <WorkspaceBreadcrumb /> : <TeamBreadcrumb />}
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {/* Left-aligned next to the sidebar, not a narrow centered column. */}
        <div className="flex-1 px-4 py-6 md:px-8 md:py-8 lg:px-12">
          <div className="w-full max-w-[1200px]">
            {/* Pages may load secondary data with useSuspenseQuery. */}
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

type Crumb = { label: string; to: string }

function TeamBreadcrumb() {
  const { team } = useCurrentTeam()
  const { tools, members, settings } = getTeamNav(team.slug)
  const section = useSection([...tools, members, settings])
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
 * On a doc or diagram page, its title as the last crumb, but only where its
 * loader would show it (same team/workspace).
 */
function useItemCrumb(): Crumb[] {
  const { docId, diagramId, workspaceId } = useParams()
  const { pathname } = useLocation()
  const { team } = useCurrentTeam()
  const doc = useQuery({ ...documentQuery(docId ?? ''), enabled: docId !== undefined }).data
  const diagram = useQuery({ ...diagramQuery(diagramId ?? ''), enabled: diagramId !== undefined }).data
  const item = docId ? doc : diagramId ? diagram : undefined
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

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
