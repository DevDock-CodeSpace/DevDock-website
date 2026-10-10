import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { LogoMark } from '@/components/Logo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { useAuth } from '@/features/auth/hooks'
import { useCollectionView } from '@/features/collections/hooks'
import { availableCollections, pickCollection, readCollectionView, rememberCollectionView } from '@/features/collections/view'
import { teamCollectionsQuery, teamWorkspacesQuery } from '@/features/workspaces/api'
import { useCurrentTeam, useMyTeams } from '../hooks'
import { teamPath } from '../nav'
import { teamPermissions, teamRoleLabel, teamTypes } from '../permissions'

/**
 * The group menu. A group with collections opens a second menu listing them: picking one shows that
 * collection alone (sidebar and group pages), which is how its parts are kept from blurring together.
 */
export function TeamSwitcher() {
  const { user } = useAuth()
  const { team, role } = useCurrentTeam()
  const view = useCollectionView()
  const memberships = useMyTeams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()

  const open = (slug: string, teamId: string, collectionId?: string) => {
    if (collectionId) rememberCollectionView(teamId, collectionId)
    if (isMobile) setOpenMobile(false)
    navigate(teamPath(slug))
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={view.collection ? `${team.name} · ${view.collection.name}` : team.name}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <LogoMark className="size-8 object-contain" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">{team.name}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {view.collection
                    ? view.collection.name
                    : `${teamRoleLabel[role].toLowerCase()} · ${teamTypes[team.type].label.toLowerCase()}`}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? 'bottom' : 'right'} align="start" sideOffset={4} className="min-w-60">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Groups</DropdownMenuLabel>
            {memberships.map((m) => {
              const Icon = teamTypes[m.team.type].icon
              const current = m.team.id === team.id
              // The open group's collections are loaded; another group's are known only if it was
              // opened earlier in this tab (no request is made just to draw this menu).
              const collections = current
                ? view.collections
                : availableCollections(
                    queryClient.getQueryData(teamCollectionsQuery(m.team.id).queryKey)?.collections ?? [],
                    queryClient.getQueryData(teamWorkspacesQuery(m.team.id).queryKey)?.workspaces ?? [],
                    user.id,
                    teamPermissions(m.role).isAdmin,
                  )
              const shown = current
                ? view.collection
                : pickCollection(collections, readCollectionView(m.team.id), user.id)
              const row = (
                <>
                  <Icon className="text-muted-foreground" />
                  <span className="flex-1 truncate">{m.team.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{teamRoleLabel[m.role].toLowerCase()}</span>
                  {current && collections.length === 0 && <Check className="size-4" />}
                </>
              )
              if (collections.length === 0) {
                return (
                  <DropdownMenuItem key={m.team.id} onSelect={() => open(m.team.slug, m.team.id)}>
                    {row}
                  </DropdownMenuItem>
                )
              }
              return (
                <DropdownMenuSub key={m.team.id}>
                  <DropdownMenuSubTrigger>{row}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-52">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Collections in {m.team.name}</DropdownMenuLabel>
                    {collections.map((collection) => {
                      const CollectionIcon = teamTypes[collection.type].icon
                      return (
                        <DropdownMenuItem key={collection.id} onSelect={() => open(m.team.slug, m.team.id, collection.id)}>
                          <CollectionIcon className="text-muted-foreground" />
                          <span className="flex-1 truncate">{collection.name}</span>
                          {current && shown?.id === collection.id && <Check className="size-4" />}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/onboarding">
                <Plus /> Create or join a group
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
