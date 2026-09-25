import { useSuspenseQuery } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import { AvatarStack } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { getWorkspaceTabs, workspacePath } from '@/features/teams/nav'
import { workspaceRoleLabel, workspaceTypes } from '@/features/teams/permissions'
import { workspaceMembersQuery } from '@/features/workspaces/api'
import { cn } from '@/lib/utils'

/** Workspace header (type · your workspace role, title, leads) + horizontal feature tabs. */
export function WorkspaceLayout() {
  const { team } = useCurrentTeam()
  const { workspace, workspaceRole, can } = useCurrentWorkspace()
  const members = useSuspenseQuery(workspaceMembersQuery(workspace.id)).data
  const leads = members.filter((m) => m.role === 'lead').flatMap((m) => (m.profile ? [m.profile] : []))
  const { label: typeLabel, icon: TypeIcon } = workspaceTypes[workspace.type]
  const base = workspacePath(team.slug, workspace.id)

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          {/* Workspace context only: type · your workspace role. Team owners/admins who
              aren't in the workspace see just the type; their access is shown by the
              settings/manage controls, not a label. */}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TypeIcon className="size-3.5" />
            {typeLabel}
            {workspaceRole && (
              <>
                <span aria-hidden>·</span>
                <span className={workspaceRole === 'lead' ? 'font-medium text-brand' : undefined}>
                  {workspaceRoleLabel[workspaceRole]}
                </span>
              </>
            )}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{workspace.title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-6">
          {leads.length > 0 && (
            <div className="hidden items-center gap-2 sm:flex" title={leads.map((l) => l.display_name).join(', ')}>
              <span className="text-xs text-muted-foreground">{leads.length === 1 ? 'Lead' : 'Leads'}</span>
              <AvatarStack people={leads} />
            </div>
          )}
          {can.canEdit && (
            <Button variant="ghost" size="icon-sm" asChild>
              <Link to={`${base}/settings`} aria-label="Workspace settings">
                <Settings />
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* Scrolls sideways on narrow screens instead of wrapping; no visible scrollbar,
          and overflow-y is hidden so the underline can never create a vertical one. */}
      <nav
        aria-label="Workspace"
        className="-mx-4 mt-5 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none] md:mx-0 [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex gap-1 px-4 md:px-0">
          {getWorkspaceTabs(team.slug, workspace.id, workspace.modules).map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-1.5 whitespace-nowrap px-2.5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                    isActive &&
                      'font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand',
                  )
                }
              >
                <tab.icon className="size-3.5" />
                {tab.title}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="pt-6">
        <Outlet />
      </div>
    </>
  )
}
