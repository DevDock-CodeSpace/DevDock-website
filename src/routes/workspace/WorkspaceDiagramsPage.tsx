import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight, Workflow } from 'lucide-react'
import { Link } from 'react-router'
import { workspaceDiagramsQuery } from '@/features/diagrams/api'
import { CreateDiagramDialog } from '@/features/diagrams/components/CreateDiagramDialog'
import { DocList } from '@/features/docs/components/DocList'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { diagramPath, diagramsPath } from '@/features/teams/nav'

/** Workspace → Diagrams: only diagrams assigned to this workspace (WorkspaceToolGate checks the tool is on). */
export function WorkspaceDiagramsPage() {
  const { team } = useCurrentTeam()
  const { workspace, can } = useCurrentWorkspace()
  const diagrams = useSuspenseQuery(workspaceDiagramsQuery(workspace.id)).data

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold">Diagrams</h2>
          <span className="font-mono text-xs text-muted-foreground">{diagrams.length}</span>
          <Link
            to={diagramsPath(team.slug)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            All group diagrams <ArrowRight className="size-3" />
          </Link>
        </div>
        <CreateDiagramDialog workspaceId={workspace.id} />
      </div>
      <DocList
        docs={diagrams}
        icon={Workflow}
        href={(diagram) => diagramPath(team.slug, diagram.id, workspace.id)}
        empty={
          can.canEdit
            ? 'No diagrams in this workspace yet. Create the first one.'
            : 'No diagrams in this workspace yet. The workspace lead can add some.'
        }
      />
    </>
  )
}
