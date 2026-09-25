import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { AvatarStack } from '@/components/PersonRow'
import { useAuth } from '@/features/auth/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { workspacePath } from '@/features/teams/nav'
import { workspaceRoleLabel, workspaceTypes } from '@/features/teams/permissions'
import { myWorkspaceRolesQuery, teamWorkspacesQuery } from '@/features/workspaces/api'
import { CreateWorkspaceDialog } from '@/features/workspaces/components/CreateWorkspaceDialog'
import { timeAgo } from '@/lib/format'

// name | type | leads | members | your role | updated
const columns = 'md:grid-cols-[minmax(0,1fr)_96px_132px_72px_88px_104px]'

/** Team home: a dense, scannable list of the workspaces the user can see. */
export function TeamWorkspacesPage() {
  const { user } = useAuth()
  const { team, can } = useCurrentTeam()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const myRoles = useSuspenseQuery(myWorkspaceRolesQuery(team.id, user.id)).data
  const [now] = useState(Date.now)

  return (
    <>
      <PageHeader
        title={team.name}
        description={
          can.canManageWorkspaces
            ? 'All courses, projects and workspaces in this group.'
            : 'What you’ve been added to in this group.'
        }
      >
        {can.canManageWorkspaces && <CreateWorkspaceDialog />}
      </PageHeader>

      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">All</h2>
        <span className="font-mono text-xs text-muted-foreground">{workspaces.length}</span>
      </div>

      {workspaces.length === 0 ? (
        <p className="border-y py-10 text-center text-sm text-muted-foreground">
          {can.canManageWorkspaces
            ? 'Nothing here yet. Create a course, project or workspace, then add people from this group to it.'
            : 'You haven’t been added to anything in this group yet. Ask a group owner or admin.'}
        </p>
      ) : (
        <div className="border-y">
          <div
            className={`hidden gap-4 border-b px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground md:grid ${columns}`}
          >
            <span>Name</span>
            <span>Type</span>
            <span>Lead</span>
            <span className="text-right">Members</span>
            <span>You</span>
            <span className="text-right">Updated</span>
          </div>
          <ul className="divide-y">
            {workspaces.map((workspace) => {
              const { label: typeLabel, icon: TypeIcon } = workspaceTypes[workspace.type]
              const myRole = myRoles[workspace.id]
              return (
                <li key={workspace.id}>
                  <Link
                    to={workspacePath(team.slug, workspace.id)}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none ${columns}`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <TypeIcon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{workspace.title}</p>
                        {workspace.description && (
                          <p className="truncate text-xs text-muted-foreground">{workspace.description}</p>
                        )}
                      </div>
                    </div>
                    <span className="hidden text-sm text-muted-foreground md:block">{typeLabel}</span>
                    <span className="hidden items-center gap-2 md:flex">
                      {workspace.leads.length > 0 ? (
                        <>
                          <AvatarStack people={workspace.leads} max={2} />
                          <span className="truncate text-xs text-muted-foreground">
                            {workspace.leads[0].display_name?.split(' ')[0]}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </span>
                    <span className="hidden text-right font-mono text-xs text-muted-foreground md:block">
                      {workspace.memberCount}
                    </span>
                    <span className={`text-xs ${myRole === 'lead' ? 'font-medium text-brand' : 'text-muted-foreground'}`}>
                      {myRole ? workspaceRoleLabel[myRole] : 'Admin'}
                    </span>
                    <span className="hidden text-right font-mono text-xs text-muted-foreground md:block">
                      {timeAgo(workspace.updated_at, now)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}
