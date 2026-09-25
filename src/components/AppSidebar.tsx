import { Link, matchPath, useLocation, useParams } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { UserMenu } from '@/features/auth/components/UserMenu'
import { WorkspaceSwitcher } from '@/features/workspaces/components/WorkspaceSwitcher'
import { useCurrentCourse, useCurrentWorkspace } from '@/features/workspaces/hooks'
import { getCourseNav, getWorkspaceNav, type NavItem } from '@/features/workspaces/nav'

export function AppSidebar() {
  const { workspace } = useCurrentWorkspace()
  const { courseId } = useParams()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <NavGroup label="Workspace" items={getWorkspaceNav(workspace.slug)} />
        {courseId && <CourseNavGroup />}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function CourseNavGroup() {
  const { workspace } = useCurrentWorkspace()
  const { course, can } = useCurrentCourse()
  const items = getCourseNav(workspace.slug, course.id).filter(
    (item) => item.title !== 'Settings' || can.canEdit,
  )
  return <NavGroup label={course.title} items={items} />
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="truncate">{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null}
              >
                <Link to={item.to} onClick={() => isMobile && setOpenMobile(false)}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
