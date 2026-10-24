import { useSuspenseQueries } from '@tanstack/react-query'
import { FileText, Workflow } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { teamDiagramsQuery } from '@/features/diagrams/api'
import { foldersQuery, teamDocsQuery } from '@/features/docs/api'
import { DocBrowser } from '@/features/docs/components/DocBrowser'
import { DocList } from '@/features/docs/components/DocList'
import { useCanEditDocs, useCanWriteDocs } from '@/features/docs/hooks'
import { useCollectionView } from '@/features/collections/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { diagramPath, docPath } from '@/features/teams/nav'

/**
 * Group → Docs: the group-wide folders, holding docs and diagrams side by side, then the docs and
 * diagrams of every workspace the user can see (RLS), which live in each workspace's own folders.
 */
export function TeamDocsPage() {
  const { team, can } = useCurrentTeam()
  const [{ data: docs }, { data: diagrams }, { data: folders }] = useSuspenseQueries({
    queries: [teamDocsQuery(team.id), teamDiagramsQuery(team.id), foldersQuery(team.id, null)],
  })
  const canWrite = useCanWriteDocs()
  const canEdit = useCanEditDocs()
  const [params] = useSearchParams()
  const show = params.get('show')
  // Group-wide items belong to everyone; workspace items follow the collection being looked at.
  const { collection, inView } = useCollectionView()
  const diagramIds = new Set(diagrams.map((d) => d.id))
  const inWorkspaces = [...(show === 'diagrams' ? [] : docs), ...(show === 'docs' ? [] : diagrams)]
    .filter((d) => d.workspace_id !== null && inView(d.workspace_id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  return (
    <>
      {/* Every group member can create group-wide docs, so "New" lives in the browser. */}
      <PageHeader
        title="Docs"
        description={`Group-wide docs and diagrams in ${team.name}, plus those of the workspaces you can access${collection ? ` in ${collection.name}` : ''}.`}
      />

      <DocBrowser
        teamId={team.id}
        workspaceId={null}
        docs={docs.filter((d) => d.workspace_id === null)}
        diagrams={diagrams.filter((d) => d.workspace_id === null)}
        folders={folders}
        mode="docs"
        diagramsEnabled
        canWrite={canWrite(null)}
        canCreate={canEdit(null)}
        docHref={(doc) => docPath(team.slug, doc.id)}
        diagramHref={(diagram) => diagramPath(team.slug, diagram.id)}
        empty={
          can.isAdmin ? 'Nothing group-wide yet. Create a doc, a diagram or a folder.' : 'No group-wide docs yet. Create the first one.'
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
            showScope
            iconFor={(item) => (diagramIds.has(item.id) ? Workflow : FileText)}
            href={(item) => (diagramIds.has(item.id) ? diagramPath(team.slug, item.id) : docPath(team.slug, item.id))}
            empty={null}
          />
        </section>
      )}
    </>
  )
}
