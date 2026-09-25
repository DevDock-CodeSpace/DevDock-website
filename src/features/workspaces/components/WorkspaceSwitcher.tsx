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
import { useCurrentWorkspace, useMyWorkspaces } from '../hooks'
import { workspacePath } from '../nav'
import { workspaceRoleLabel } from '../permissions'

export function WorkspaceSwitcher() {
  const { workspace, role } = useCurrentWorkspace()
  const memberships = useMyWorkspaces()
  const navigate = useNavigate()
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={workspace.name}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <LogoMark className="size-8 object-contain" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">{workspace.name}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {workspaceRoleLabel[role].toLowerCase()}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? 'bottom' : 'right'}
            align="start"
            sideOffset={4}
            className="min-w-60"
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
            {memberships.map((m) => (
              <DropdownMenuItem
                key={m.workspace.id}
                onSelect={() => {
                  if (isMobile) setOpenMobile(false)
                  navigate(workspacePath(m.workspace.slug))
                }}
              >
                <span className="flex-1 truncate">{m.workspace.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {workspaceRoleLabel[m.role].toLowerCase()}
                </span>
                {m.workspace.id === workspace.id && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/onboarding">
                <Plus /> Create or join a workspace
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
