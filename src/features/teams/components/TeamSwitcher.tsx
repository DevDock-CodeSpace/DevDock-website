import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { LogoMark } from '@/components/Logo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { useCurrentTeam, useMyTeams } from '../hooks'
import { teamPath } from '../nav'
import { teamRoleLabel, teamTypes } from '../permissions'

export function TeamSwitcher() {
  const { team, role } = useCurrentTeam()
  const memberships = useMyTeams()
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={team.name}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <LogoMark className="size-8 object-contain" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">{team.name}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {teamRoleLabel[role].toLowerCase()} · {teamTypes[team.type].label.toLowerCase()}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? 'bottom' : 'right'} align="start" sideOffset={4} className="min-w-60">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Teams</DropdownMenuLabel>
            {memberships.map((m) => {
              const Icon = teamTypes[m.team.type].icon
              return (
                <DropdownMenuItem
                  key={m.team.id}
                  onSelect={() => {
                    if (isMobile) setOpenMobile(false)
                    navigate(teamPath(m.team.slug))
                  }}
                >
                  <Icon className="text-muted-foreground" />
                  <span className="flex-1 truncate">{m.team.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{teamRoleLabel[m.role].toLowerCase()}</span>
                  {m.team.id === team.id && <Check className="size-4" />}
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/onboarding">
                <Plus /> Create or join a team
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
