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
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { getTeamNav, getWorkspaceNav, teamPath, workspacePath } from '@/features/teams/nav'

// The shadcn sidebar writes its open/collapsed state to this cookie but doesn't read it back.
const sidebarStartsOpen = () => !document.cookie.includes('sidebar_state=false')

/** Team shell: sidebar + header + page. Rendered for /t/:teamSlug/*. */
export function AppLayout() {
  const { workspaceId } = useParams()
  return (
    <SidebarProvider defaultOpen={sidebarStartsOpen()}>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-center" />
          {workspaceId ? <WorkspaceBreadcrumb /> : <TeamBreadcrumb />}
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-5xl">
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
  const section = useSection(getTeamNav(team.slug))
  return <Crumbs crumbs={[{ label: team.name, to: teamPath(team.slug) }, ...section]} />
}

function WorkspaceBreadcrumb() {
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()
  const section = useSection(getWorkspaceNav(team.slug, workspace.id, workspace.type))
  return (
    <Crumbs
      crumbs={[
        { label: team.name, to: teamPath(team.slug) },
        { label: workspace.title, to: workspacePath(team.slug, workspace.id) },
        ...section,
      ]}
    />
  )
}

/** The current non-index nav item as a crumb, if any. */
function useSection(items: ReturnType<typeof getTeamNav>): Crumb[] {
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
