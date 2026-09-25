import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { workspaceDocsQuery } from '@/features/docs/api'
import { CreateDocDialog } from '@/features/docs/components/CreateDocDialog'
import { DocList } from '@/features/docs/components/DocList'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { docPath, docsPath } from '@/features/teams/nav'

/** Workspace → Docs: only docs assigned to this workspace (WorkspaceToolGate checks the tool is on). */
export function WorkspaceDocsPage() {
  const { team } = useCurrentTeam()
  const { workspace, can } = useCurrentWorkspace()
  const docs = useSuspenseQuery(workspaceDocsQuery(workspace.id)).data

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold">Docs</h2>
          <span className="font-mono text-xs text-muted-foreground">{docs.length}</span>
          <Link
            to={docsPath(team.slug)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            All group docs <ArrowRight className="size-3" />
          </Link>
        </div>
        <CreateDocDialog workspaceId={workspace.id} />
      </div>
      <DocList
        docs={docs}
        href={(doc) => docPath(team.slug, doc.id, workspace.id)}
        empty={
          can.canEdit
            ? 'No docs in this workspace yet. Create the first one.'
            : 'No docs in this workspace yet. The workspace lead can add some.'
        }
      />
    </>
  )
}
