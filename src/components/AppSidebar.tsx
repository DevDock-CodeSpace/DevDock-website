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
import { workspaceNoun, workspaceTypes } from '@/features/teams/permissions'
import { teamWorkspacesQuery } from '@/features/workspaces/api'
import { CreateWorkspaceDialog } from '@/features/workspaces/components/CreateWorkspaceDialog'

// Active item: accent background (from shadcn) + DevDock-blue icon.
const activeIcon = 'data-active:[&_svg]:text-brand'

/**
 * The sidebar is the hierarchy: team → its workspaces. Workspace features
 * (docs, live, …) are tabs under the workspace title, not sidebar items.
 */
export function AppSidebar() {
  const { team, can } = useCurrentTeam()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const nav = getTeamNav(team.slug)
  const noun = workspaceNoun[team.type]
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
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{noun.plural}</SidebarGroupLabel>
          <SidebarMenu>
            {workspaces.map((workspace) => {
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
            {workspaces.length === 0 && !can.canManageWorkspaces && (
              <li className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                You haven’t been added to any {noun.plural.toLowerCase()} yet.
              </li>
            )}
            {can.canManageWorkspaces && (
              <SidebarMenuItem>
                <CreateWorkspaceDialog
                  trigger={
                    <SidebarMenuButton tooltip={`New ${noun.singular.toLowerCase()}`} className="text-muted-foreground">
                      <Plus />
                      <span>New {noun.singular.toLowerCase()}</span>
                    </SidebarMenuButton>
                  }
                />
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Team</SidebarGroupLabel>
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
