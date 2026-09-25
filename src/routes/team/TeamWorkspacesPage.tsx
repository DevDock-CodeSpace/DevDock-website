import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight, LayoutGrid, Users } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { workspacePath } from '@/features/teams/nav'
import { workspaceRoleLabel, workspaceTypes } from '@/features/teams/permissions'
import { myWorkspaceRolesQuery, teamWorkspacesQuery } from '@/features/workspaces/api'
import { CreateWorkspaceDialog } from '@/features/workspaces/components/CreateWorkspaceDialog'

/** Team home: the workspaces the user can see. */
export function TeamWorkspacesPage() {
  const { user } = useAuth()
  const { team, can } = useCurrentTeam()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const myRoles = useSuspenseQuery(myWorkspaceRolesQuery(team.id, user.id)).data

  return (
    <>
      <PageHeader
        title="Workspaces"
        description={
          can.canManageWorkspaces ? 'Every workspace in this team.' : 'Workspaces you’ve been added to in this team.'
        }
      >
        {can.canManageWorkspaces && <CreateWorkspaceDialog />}
      </PageHeader>

      {workspaces.length === 0 ? (
        <EmptyState canCreate={can.canManageWorkspaces} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workspaces.map((workspace) => {
            const myRole = myRoles[workspace.id]
            const { label: typeLabel, icon: TypeIcon } = workspaceTypes[workspace.type]
            return (
              <Card key={workspace.id} className="transition-shadow hover:ring-foreground/25">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1 font-normal">
                      <TypeIcon className="size-3" />
                      {typeLabel}
                    </Badge>
                    {myRole ? (
                      <Badge variant={myRole === 'lead' ? 'default' : 'secondary'}>{workspaceRoleLabel[myRole]}</Badge>
                    ) : (
                      <Badge variant="outline">Team admin</Badge>
                    )}
                    <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {workspace.memberCount}
                    </span>
                  </div>
                  <CardTitle className="pt-2 text-lg">{workspace.title}</CardTitle>
                  {workspace.description && (
                    <CardDescription className="line-clamp-2">{workspace.description}</CardDescription>
                  )}
                </CardHeader>
                <CardFooter>
                  <Link
                    to={workspacePath(team.slug, workspace.id)}
                    className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    Open workspace <ArrowRight className="size-4" />
                  </Link>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function EmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <LayoutGrid className="size-8 text-muted-foreground" />
      <p className="font-medium">No workspaces yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {canCreate
          ? 'Create the first workspace (a course, a project, or anything else), then add people from this team to it.'
          : 'You haven’t been added to any workspaces in this team. Ask an owner or admin to add you.'}
      </p>
    </div>
  )
}
