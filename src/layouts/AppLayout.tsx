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
import { useCurrentCourse, useCurrentWorkspace } from '@/features/workspaces/hooks'
import { coursePath, getCourseNav, getWorkspaceNav, workspacePath } from '@/features/workspaces/nav'

// The shadcn sidebar writes its open/collapsed state to this cookie but doesn't read it back.
const sidebarStartsOpen = () => !document.cookie.includes('sidebar_state=false')

/** Workspace shell: sidebar + header + page. Rendered for /w/:workspaceSlug/*. */
export function AppLayout() {
  const { courseId } = useParams()
  return (
    <SidebarProvider defaultOpen={sidebarStartsOpen()}>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-center" />
          {courseId ? <CourseBreadcrumb /> : <WorkspaceBreadcrumb />}
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

function WorkspaceBreadcrumb() {
  const { workspace } = useCurrentWorkspace()
  const section = useSection(getWorkspaceNav(workspace.slug))
  return <Crumbs crumbs={[{ label: workspace.name, to: workspacePath(workspace.slug) }, ...section]} />
}

function CourseBreadcrumb() {
  const { workspace } = useCurrentWorkspace()
  const { course } = useCurrentCourse()
  const section = useSection(getCourseNav(workspace.slug, course.id))
  return (
    <Crumbs
      crumbs={[
        { label: workspace.name, to: workspacePath(workspace.slug) },
        { label: course.title, to: coursePath(workspace.slug, course.id) },
        ...section,
      ]}
    />
  )
}

/** The current non-index nav item as a crumb, if any. */
function useSection(items: ReturnType<typeof getWorkspaceNav>): Crumb[] {
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
