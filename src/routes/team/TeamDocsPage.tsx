import { useSuspenseQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { teamDocsQuery } from '@/features/docs/api'
import { CreateDocDialog } from '@/features/docs/components/CreateDocDialog'
import { DocList } from '@/features/docs/components/DocList'
import { useCurrentTeam } from '@/features/teams/hooks'
import { docPath } from '@/features/teams/nav'

/** Team → Docs: team-wide docs plus docs from every workspace the user can see (RLS). */
export function TeamDocsPage() {
  const { team, can } = useCurrentTeam()
  const docs = useSuspenseQuery(teamDocsQuery(team.id)).data

  return (
    <>
      <PageHeader
        title="Docs"
        description={`Group-wide docs in ${team.name}, plus docs from the workspaces you can access.`}
      >
        <CreateDocDialog />
      </PageHeader>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">All docs</h2>
        <span className="font-mono text-xs text-muted-foreground">{docs.length}</span>
      </div>
      <DocList
        docs={docs}
        showScope
        href={(doc) => docPath(team.slug, doc.id)}
        empty={
          can.isAdmin
            ? 'No docs yet. Create a group-wide doc, or one for a workspace.'
            : 'No docs yet. Group owners/admins write group-wide docs; workspace leads write docs for their workspace.'
        }
      />
    </>
  )
}
