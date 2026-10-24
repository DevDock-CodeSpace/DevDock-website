import { useSuspenseQueries } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { noDiagramsQuery, workspaceDiagramsQuery } from '@/features/diagrams/api'
import { foldersQuery, workspaceDocsQuery } from '@/features/docs/api'
import { DocBrowser } from '@/features/docs/components/DocBrowser'
import { useCanEditDocs, useCanWriteDocs } from '@/features/docs/hooks'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { diagramPath, docPath, docsPath } from '@/features/teams/nav'

/**
 * Workspace → Docs: this workspace's folders, holding its docs and (when the Diagrams tool is on)
 * its diagrams side by side. WorkspaceToolGate checks the Docs tool is on.
 */
export function WorkspaceDocsPage() {
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()
  const diagramsEnabled = workspace.modules.includes('diagrams')
  const [{ data: docs }, { data: folders }, { data: diagrams }] = useSuspenseQueries({
    queries: [
      workspaceDocsQuery(workspace.id),
      foldersQuery(team.id, workspace.id),
      diagramsEnabled ? workspaceDiagramsQuery(workspace.id) : noDiagramsQuery,
    ],
  })
  const canWrite = useCanWriteDocs()(workspace.id)
  const canEdit = useCanEditDocs()(workspace.id)

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Link
          to={docsPath(team.slug)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          All group docs <ArrowRight className="size-3" />
        </Link>
      </div>
      <DocBrowser
        teamId={team.id}
        workspaceId={workspace.id}
        docs={docs}
        diagrams={diagrams}
        folders={folders}
        mode="docs"
        diagramsEnabled={diagramsEnabled}
        canWrite={canWrite}
        canCreate={canEdit}
        docHref={(doc) => docPath(team.slug, doc.id, workspace.id)}
        diagramHref={(diagram) => diagramPath(team.slug, diagram.id, workspace.id)}
        empty={
          canWrite
            ? `No docs in this workspace yet. Create a doc${diagramsEnabled ? ', a diagram' : ''} or a folder.`
            : canEdit
              ? 'No docs in this workspace yet. Create the first one.'
              : 'No docs in this workspace yet.'
        }
      />
    </>
  )
}
