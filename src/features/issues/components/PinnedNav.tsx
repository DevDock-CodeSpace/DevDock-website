import { useQuery } from '@tanstack/react-query'
import { ChevronDown, IterationCw, Layers, ListTodo, MoreHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { PersonAvatar } from '@/components/PersonRow'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { teamMembersQuery } from '@/features/teams/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import { cyclePath, cyclesPath, issuesPath } from '@/features/teams/nav'
import { teamWorkspacesQuery } from '@/features/workspaces/api'
import { FACETS, ISSUE_TABS, readFilters, readTab } from '../filters'
import { personHref, personOf, readViewState, tabHref, viewHref, VIEW_PARAM } from '../views'
import { cycleTitle } from '../cycles'
import { pinnedCyclesQuery, teamViewsQuery, type IssuePin } from '../viewsApi'
import { usePins } from '../viewsHooks'

/** How many pins show before "N more". */
const VISIBLE = 6

type Item = { pin: IssuePin; label: string; where: string; to: string; icon: ReactNode; active: boolean }

/**
 * The sidebar's "Pinned" section: your saved views, people's issues and built-in tabs, each pinned
 * from the Issues page. Pins whose view or workspace you can no longer see are left out.
 */
export function PinnedNav({ onNavigate }: { onNavigate: () => void }) {
  const { team } = useCurrentTeam()
  const { pathname, search } = useLocation()
  const { pins, remove, reorder } = usePins(team.id)
  const views = useQuery(teamViewsQuery(team.id)).data
  const workspaces = useQuery(teamWorkspacesQuery(team.id)).data
  const people = useQuery(teamMembersQuery(team.id)).data
  const cycles = useQuery(pinnedCyclesQuery(pins.flatMap((pin) => (pin.cycle_id ? [pin.cycle_id] : [])))).data
  const [expanded, setExpanded] = useState(false)
  // The project's name only helps when there is more than one to tell apart.
  const showWhere = (workspaces?.length ?? 0) > 1
  const params = new URLSearchParams(search)

  const items: Item[] = pins.flatMap((pin): Item[] => {
    const workspace = workspaces?.find((item) => item.id === pin.workspace_id)
    if (!workspace) return []
    const base = issuesPath(team.slug, workspace.id)
    const here = pathname === base
    const plain = FACETS.every((facet) => readFilters(params)[facet].length === 0)
    if (pin.kind === 'view') {
      const view = views?.find((item) => item.id === pin.view_id)
      if (!view) return []
      return [{ pin, label: view.name, where: workspace.title, to: viewHref(base, view), icon: <Layers />, active: here && params.get(VIEW_PARAM) === view.id }]
    }
    if (pin.kind === 'person') {
      const person = people?.find((item) => item.user_id === pin.person_id)
      if (!person || !pin.person_id) return []
      return [
        {
          pin,
          label: person.profile?.display_name ?? 'Unnamed member',
          where: workspace.title,
          to: personHref(base, pin.person_id),
          icon: <PersonAvatar profile={person.profile} className="size-4" fallbackClassName="text-[8px]" />,
          active: here && !params.has(VIEW_PARAM) && personOf(readViewState(params)) === pin.person_id,
        },
      ]
    }
    if (pin.kind === 'cycle') {
      const cycle = cycles?.find((item) => item.id === pin.cycle_id)
      if (!cycle) return []
      const to = cyclePath(team.slug, workspace.id, cycle.number)
      return [{ pin, label: cycleTitle(cycle), where: workspace.title, to, icon: <IterationCw />, active: pathname === to }]
    }
    if (pin.kind === 'current_cycle') {
      const to = `${cyclesPath(team.slug, workspace.id)}/current`
      return [{ pin, label: 'Current cycle', where: workspace.title, to, icon: <IterationCw />, active: pathname === to }]
    }
    const tab = ISSUE_TABS.find((item) => item.id === pin.tab)
    if (!tab) return []
    return [{ pin, label: tab.label, where: workspace.title, to: tabHref(base, tab.id), icon: <ListTodo />, active: here && !params.has(VIEW_PARAM) && plain && readTab(params) === tab.id }]
  })

  if (items.length === 0) return null
  const shown = expanded ? items : items.slice(0, VISIBLE)
  const hiddenIds = pins.filter((pin) => !items.some((item) => item.pin.id === pin.id)).map((pin) => pin.id)

  const move = (index: number, by: -1 | 1) => {
    const order = items.map((item) => item.pin.id)
    const target = index + by
    ;[order[index], order[target]] = [order[target], order[index]]
    reorder.mutate([...order, ...hiddenIds])
  }

  return (
    <SidebarGroup className="pb-0">
      <SidebarGroupLabel>Pinned</SidebarGroupLabel>
      <SidebarMenu>
        {shown.map((item, index) => (
          <SidebarMenuItem key={item.pin.id}>
            <SidebarMenuButton asChild tooltip={`${item.label} · ${item.where}`} isActive={item.active} className="data-active:[&_svg]:text-brand">
              <Link to={item.to} onClick={onNavigate}>
                {item.icon}
                <span className="min-w-0 truncate">{item.label}</span>
                {showWhere && <span className="ml-auto max-w-20 shrink-0 truncate text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">{item.where}</span>}
              </Link>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover aria-label={`Options for ${item.label}`}>
                  <MoreHorizontal />
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start">
                <DropdownMenuItem onSelect={() => remove.mutate(item.pin.id)}>Unpin</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={index === 0} onSelect={() => move(index, -1)}>Move up</DropdownMenuItem>
                <DropdownMenuItem disabled={index === items.length - 1} onSelect={() => move(index, 1)}>Move down</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        {items.length > VISIBLE && (
          <SidebarMenuItem>
            <SidebarMenuButton className="text-muted-foreground" onClick={() => setExpanded((open) => !open)}>
              <ChevronDown className={expanded ? 'rotate-180' : undefined} />
              <span>{expanded ? 'Show fewer' : `${items.length - VISIBLE} more`}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
