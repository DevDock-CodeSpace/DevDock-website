import { useSuspenseQueries } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { workspaceDiagramsQuery } from '@/features/diagrams/api'
import { foldersQuery, workspaceDocsQuery } from '@/features/docs/api'
import { DocBrowser } from '@/features/docs/components/DocBrowser'
import { useCanWriteDocs } from '@/features/docs/hooks'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { diagramPath, diagramsPath, docPath } from '@/features/teams/nav'

/**
 * Workspace → Diagrams: a shortcut to this workspace's folders showing only diagrams (they share
 * folders with docs). WorkspaceToolGate checks the Diagrams tool is on.
 */
export function WorkspaceDiagramsPage() {
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()
  // The docs aren't shown here, but folders are shared: deleting one deletes the docs inside too.
  const [{ data: diagrams }, { data: folders }, { data: docs }] = useSuspenseQueries({
    queries: [workspaceDiagramsQuery(workspace.id), foldersQuery(team.id, workspace.id), workspaceDocsQuery(workspace.id)],
  })
  const canWrite = useCanWriteDocs()(workspace.id)

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Link
          to={diagramsPath(team.slug)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          All group diagrams <ArrowRight className="size-3" />
        </Link>
      </div>
      <DocBrowser
        teamId={team.id}
        workspaceId={workspace.id}
        docs={docs}
        diagrams={diagrams}
        folders={folders}
        mode="diagrams"
        diagramsEnabled
        canWrite={canWrite}
        canCreate={false}
        docHref={(doc) => docPath(team.slug, doc.id, workspace.id)}
        diagramHref={(diagram) => diagramPath(team.slug, diagram.id, workspace.id)}
        empty={
          canWrite
            ? 'No diagrams in this workspace yet. Create the first one, or a folder.'
            : 'No diagrams in this workspace yet. The workspace lead can add some.'
        }
      />
    </>
  )
}
