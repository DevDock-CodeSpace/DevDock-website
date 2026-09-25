import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { foldersQuery, workspaceDocsQuery } from '@/features/docs/api'
import { DocBrowser } from '@/features/docs/components/DocBrowser'
import { useCanWriteDocs } from '@/features/docs/hooks'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { docPath, docsPath } from '@/features/teams/nav'

/** Workspace → Docs: this workspace's folders and docs (WorkspaceToolGate checks the tool is on). */
export function WorkspaceDocsPage() {
  const { team } = useCurrentTeam()
  const { workspace, can } = useCurrentWorkspace()
  const docs = useSuspenseQuery(workspaceDocsQuery(workspace.id)).data
  const folders = useSuspenseQuery(foldersQuery(team.id, workspace.id)).data
  const canWrite = useCanWriteDocs()(workspace.id)

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
        folders={folders}
        canWrite={canWrite}
        docHref={(doc) => docPath(team.slug, doc.id, workspace.id)}
        empty={
          can.canEdit
            ? 'No docs in this workspace yet. Create a doc or a folder.'
            : 'No docs in this workspace yet. The workspace lead can add some.'
        }
      />
    </>
  )
}
