import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Link, matchPath, useLocation } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
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
import { useCurrentTeam } from '@/features/teams/hooks'
import { getTeamNav, workspacePath, type NavItem } from '@/features/teams/nav'
import { workspaceTypeOrder, workspaceTypes } from '@/features/teams/permissions'
import { teamWorkspacesQuery } from '@/features/workspaces/api'
import { CreateWorkspaceDialog } from '@/features/workspaces/components/CreateWorkspaceDialog'

// Active item: accent background (from shadcn) + DevDock-blue icon.
const activeIcon = 'data-active:[&_svg]:text-brand'

/**
 * The sidebar is the hierarchy: team → its workspaces, grouped by workspace
 * type (Courses, Projects, Workspaces). The team tools on top (Docs, Diagrams,
 * Live) are team-wide views; inside a workspace the same tools are tabs that
 * show only that workspace's items. Workspace features are never sidebar items.
 */
export function AppSidebar() {
  const { team, can } = useCurrentTeam()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const nav = getTeamNav(team.slug)
  // One section per workspace type that has items; the team type only decides which comes first.
  const sections = workspaceTypeOrder(team.type)
    .map((type) => ({ type, items: workspaces.filter((w) => w.type === type) }))
    .filter((section) => section.items.length > 0)
  const close = () => isMobile && setOpenMobile(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="pb-0">
          <SidebarMenu>
            <NavLinkItem item={nav.home} onNavigate={close} />
            {nav.tools.map((item) => (
              <NavLinkItem key={item.id} item={item} onNavigate={close} />
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {sections.map(({ type, items }) => (
          <SidebarGroup key={type} className="pb-0">
            <SidebarGroupLabel>{workspaceTypes[type].plural}</SidebarGroupLabel>
            <SidebarMenu>
              {items.map((workspace) => {
                const to = workspacePath(team.slug, workspace.id)
                const Icon = workspaceTypes[workspace.type].icon
                return (
                  <SidebarMenuItem key={workspace.id}>
                    <SidebarMenuButton
                      asChild
                      tooltip={workspace.title}
                      className={activeIcon}
                      isActive={matchPath({ path: to, end: false }, pathname) !== null}
                    >
                      <Link to={to} onClick={close}>
                        <Icon />
                        <span>{workspace.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}

        {(can.canManageWorkspaces || workspaces.length === 0) && (
          <SidebarGroup className={sections.length > 0 ? 'pt-0' : undefined}>
            <SidebarMenu>
              {workspaces.length === 0 && !can.canManageWorkspaces && (
                <li className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  You haven’t been added to anything in this group yet.
                </li>
              )}
              {can.canManageWorkspaces && (
                <SidebarMenuItem>
                  <CreateWorkspaceDialog
                    trigger={
                      <SidebarMenuButton tooltip="New" className="text-muted-foreground">
                        <Plus />
                        <span>New</span>
                      </SidebarMenuButton>
                    }
                  />
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Group</SidebarGroupLabel>
          <SidebarMenu>
            <NavLinkItem item={nav.members} onNavigate={close} />
            <NavLinkItem item={nav.settings} onNavigate={close} />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function NavLinkItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const { pathname } = useLocation()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={item.title}
        className={activeIcon}
        isActive={matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null}
      >
        <Link to={item.to} onClick={onNavigate}>
          <item.icon />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
