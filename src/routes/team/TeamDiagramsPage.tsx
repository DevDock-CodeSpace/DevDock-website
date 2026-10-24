import { useSuspenseQueries } from '@tanstack/react-query'
import { Workflow } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { teamDiagramsQuery } from '@/features/diagrams/api'
import { foldersQuery, teamDocsQuery } from '@/features/docs/api'
import { DocBrowser } from '@/features/docs/components/DocBrowser'
import { DocList } from '@/features/docs/components/DocList'
import { useCanWriteDocs } from '@/features/docs/hooks'
import { useCollectionView } from '@/features/collections/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { diagramPath, docPath } from '@/features/teams/nav'

/**
 * Team → Diagrams: a shortcut to the group's folders showing only diagrams (they share folders
 * with docs), then the diagrams of every workspace the user can see (RLS).
 */
export function TeamDiagramsPage() {
  const { team, can } = useCurrentTeam()
  // The docs aren't shown here, but folders are shared: deleting one deletes the docs inside too.
  const [{ data: diagrams }, { data: folders }, { data: docs }] = useSuspenseQueries({
    queries: [teamDiagramsQuery(team.id), foldersQuery(team.id, null), teamDocsQuery(team.id)],
  })
  const canWrite = useCanWriteDocs()
  const { collection, inView } = useCollectionView()
  const inWorkspaces = diagrams.filter((d) => d.workspace_id !== null && inView(d.workspace_id))

  return (
    <>
      <PageHeader
        title="Diagrams"
        description={`Group-wide diagrams in ${team.name}, plus diagrams from the workspaces you can access${collection ? ` in ${collection.name}` : ''}. They share folders with docs.`}
      />
      <DocBrowser
        teamId={team.id}
        workspaceId={null}
        docs={docs.filter((d) => d.workspace_id === null)}
        diagrams={diagrams.filter((d) => d.workspace_id === null)}
        folders={folders}
        mode="diagrams"
        diagramsEnabled
        canWrite={canWrite(null)}
        canCreate={false}
        docHref={(doc) => docPath(team.slug, doc.id)}
        diagramHref={(diagram) => diagramPath(team.slug, diagram.id)}
        empty={
          can.isAdmin
            ? 'No group-wide diagrams yet. Create one, or one for a workspace.'
            : 'No group-wide diagrams yet. Group owners/admins draw group-wide diagrams; workspace leads draw diagrams for their workspace.'
        }
      />
      {inWorkspaces.length > 0 && (
        <section className="mt-10">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">In workspaces</h2>
            <span className="font-mono text-xs text-muted-foreground">{inWorkspaces.length}</span>
          </div>
          <DocList
            docs={inWorkspaces}
            icon={Workflow}
            showScope
            href={(diagram) => diagramPath(team.slug, diagram.id)}
            empty={null}
          />
        </section>
      )}
    </>
  )
}
