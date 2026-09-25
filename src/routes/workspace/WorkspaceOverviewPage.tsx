import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight, Users } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { getWorkspaceNav, workspacePath } from '@/features/teams/nav'
import { workspaceRoleLabel, workspaceTypes } from '@/features/teams/permissions'
import { workspaceMembersQuery } from '@/features/workspaces/api'

const UPCOMING = new Set(['Lessons', 'Live Session', 'Resources'])

export function WorkspaceOverviewPage() {
  const { team } = useCurrentTeam()
  const { workspace, workspaceRole } = useCurrentWorkspace()
  const members = useSuspenseQuery(workspaceMembersQuery(workspace.id)).data
  const leads = members.filter((m) => m.role === 'lead')
  const base = workspacePath(team.slug, workspace.id)
  const { label: typeLabel, icon: TypeIcon } = workspaceTypes[workspace.type]
  const upcoming = getWorkspaceNav(team.slug, workspace.id, workspace.type).filter((i) => UPCOMING.has(i.title))

  return (
    <>
      <PageHeader title={workspace.title} description={workspace.description ?? undefined}>
        <Badge variant="outline" className="gap-1 font-normal">
          <TypeIcon className="size-3" />
          {typeLabel}
        </Badge>
        <Badge variant={workspaceRole === 'lead' ? 'default' : workspaceRole ? 'secondary' : 'outline'}>
          {workspaceRole ? workspaceRoleLabel[workspaceRole] : 'Team admin'}
        </Badge>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>People</CardDescription>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {leads.length > 0
                ? `Led by ${leads.map((l) => l.profile?.display_name ?? 'a member').join(', ')}`
                : 'No lead assigned yet.'}
            </p>
            <Link to={`${base}/members`} className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
              View members <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Coming next</CardDescription>
            <CardTitle>Workspace content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <item.icon className="size-4" />
                {item.title}
                <span className="ml-auto font-mono text-xs">soon</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
