import { Link, useParams } from 'react-router'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { hasWorkspaceTab, isTeamTool, teamPath, teamToolDefs, workspaceTabDefs } from '@/features/teams/nav'

/** Enabled tools whose features don't exist yet (Docs, Live, …). Tools not enabled here → not found. */
export function WorkspaceTabPage() {
  const { tab = '' } = useParams()
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()

  if (!hasWorkspaceTab(workspace.modules, tab) || !workspaceTabDefs[tab].soon) {
    return (
      <div className="py-16 text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <p className="mt-1 font-medium">This tool isn’t enabled in this workspace.</p>
      </div>
    )
  }

  const { title, icon: Icon, soon } = workspaceTabDefs[tab]
  return (
    <div className="flex max-w-lg items-start gap-4 py-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">
          {title} <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">coming soon</span>
        </p>
        <p className="text-sm text-muted-foreground">{soon}</p>
        {isTeamTool(tab) && (
          <p className="text-sm text-muted-foreground">
            This tab shows only {teamToolDefs[tab].items} assigned to {workspace.title}. For everything in the team, see{' '}
            <Link to={`${teamPath(team.slug)}/${tab}`} className="underline underline-offset-4 hover:text-foreground">
              Team {title}
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  )
}
