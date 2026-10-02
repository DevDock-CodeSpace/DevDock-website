import { useSuspenseQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { foldersQuery, teamDocsQuery } from '@/features/docs/api'
import { DocBrowser } from '@/features/docs/components/DocBrowser'
import { DocList } from '@/features/docs/components/DocList'
import { useCanEditDocs, useCanWriteDocs } from '@/features/docs/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { docPath } from '@/features/teams/nav'

/**
 * Group → Docs: the group-wide docs as a folder browser, then docs from every
 * workspace the user can see (RLS), which live in each workspace's own folders.
 */
export function TeamDocsPage() {
  const { team, can } = useCurrentTeam()
  const docs = useSuspenseQuery(teamDocsQuery(team.id)).data
  const folders = useSuspenseQuery(foldersQuery(team.id, null)).data
  const canWrite = useCanWriteDocs()
  const canEdit = useCanEditDocs()
  const groupWide = docs.filter((d) => d.workspace_id === null)
  const inWorkspaces = docs.filter((d) => d.workspace_id !== null)

  return (
    <>
      {/* Every group member can create group-wide docs, so "New doc" lives in the browser. */}
      <PageHeader
        title="Docs"
        description={`Group-wide docs in ${team.name}, plus docs from the workspaces you can access.`}
      />

      <DocBrowser
        teamId={team.id}
        workspaceId={null}
        docs={groupWide}
        folders={folders}
        canWrite={canWrite(null)}
        canCreate={canEdit(null)}
        docHref={(doc) => docPath(team.slug, doc.id)}
        empty={
          can.isAdmin ? 'No group-wide docs yet. Create a doc or a folder.' : 'No group-wide docs yet. Create the first one.'
        }
      />

      {inWorkspaces.length > 0 && (
        <section className="mt-10">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">In workspaces</h2>
            <span className="font-mono text-xs text-muted-foreground">{inWorkspaces.length}</span>
          </div>
          <DocList docs={inWorkspaces} showScope href={(doc) => docPath(team.slug, doc.id)} empty={null} />
        </section>
      )}
    </>
  )
}
