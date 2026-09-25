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
import { TeamSwitcher } from '@/features/teams/components/TeamSwitcher'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { getTeamNav, getWorkspaceNav, type NavItem } from '@/features/teams/nav'

export function AppSidebar() {
  const { team } = useCurrentTeam()
  const { workspaceId } = useParams()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <NavGroup label="Team" items={getTeamNav(team.slug)} />
        {workspaceId && <WorkspaceNavGroup />}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function WorkspaceNavGroup() {
  const { team } = useCurrentTeam()
  const { workspace, can } = useCurrentWorkspace()
  const items = getWorkspaceNav(team.slug, workspace.id, workspace.type).filter(
    (item) => item.title !== 'Settings' || can.canEdit,
  )
  return <NavGroup label={workspace.title} items={items} />
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
