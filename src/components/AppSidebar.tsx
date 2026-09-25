import { useSuspenseQuery } from '@tanstack/react-query'
import { ChevronRight, Pin, Plus } from 'lucide-react'
import { Link, matchPath, useLocation, useParams } from 'react-router'
import { TruncatedText } from '@/components/TruncatedText'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { UserMenu } from '@/features/auth/components/UserMenu'
import { TeamSwitcher } from '@/features/teams/components/TeamSwitcher'
import { useCurrentTeam } from '@/features/teams/hooks'
import { getTeamNav, teamPath, workspacePath, type NavItem } from '@/features/teams/nav'
import { workspaceTypeOrder, workspaceTypes } from '@/features/teams/permissions'
import { teamWorkspacesQuery } from '@/features/workspaces/api'
import { CreateWorkspaceDialog } from '@/features/workspaces/components/CreateWorkspaceDialog'
import { usePins, useRecentVisits } from '@/features/workspaces/hooks'
import { pickSidebarItems } from '@/features/workspaces/recent'

// Active item: accent background (from shadcn) + DevDock-blue icon.
const activeIcon = 'data-active:[&_svg]:text-brand'

/**
 * The sidebar is the hierarchy: team → its workspaces, grouped by workspace
 * type (Courses, Projects, Spaces). The team tools on top (Docs, Diagrams,
 * Live) are team-wide views; inside a workspace the same tools are tabs that
 * show only that workspace's items. Workspace features are never sidebar items.
 * Each type section shows at most 3: pinned first, then recently opened. The
 * section title ("Courses · 5") links to the full list.
 */
export function AppSidebar() {
  const { team, can } = useCurrentTeam()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const { pathname } = useLocation()
  const { workspaceId } = useParams()
  const { isMobile, setOpenMobile } = useSidebar()
  const { pins, isPinned, setPinned } = usePins()
  const visits = useRecentVisits(team.id)
  const nav = getTeamNav(team.slug, team.type)
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

        {sections.map(({ type, items }) => {
          const { shown } = pickSidebarItems(items, pins, visits, workspaceId)
          const allHref = `${teamPath(team.slug)}?type=${type}`
          return (
            <SidebarGroup key={type} className="pb-0">
              {/* The title opens the full list of this type. */}
              <SidebarGroupLabel asChild>
                <Link
                  to={allHref}
                  onClick={close}
                  title={`All ${workspaceTypes[type].plural.toLowerCase()}`}
                  className="group/label gap-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  {workspaceTypes[type].plural}
                  <span className="font-mono text-[10px] opacity-70">· {items.length}</span>
                  <ChevronRight className="ml-auto opacity-0 transition-opacity group-hover/label:opacity-100" />
                </Link>
              </SidebarGroupLabel>
              <SidebarMenu>
                {shown.map((workspace) => {
                  const to = workspacePath(team.slug, workspace.id)
                  const Icon = workspaceTypes[workspace.type].icon
                  const pinned = isPinned(workspace.id)
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
                          <TruncatedText text={workspace.title} />
                        </Link>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover={!pinned}
                        aria-label={pinned ? `Unpin ${workspace.title}` : `Pin ${workspace.title}`}
                        title={pinned ? 'Unpin' : 'Pin to the top'}
                        onClick={() => setPinned(workspace.id, !pinned)}
                        className={pinned ? 'text-muted-foreground' : undefined}
                      >
                        {pinned ? <Pin className="fill-current" /> : <Pin />}
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          )
        })}

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
