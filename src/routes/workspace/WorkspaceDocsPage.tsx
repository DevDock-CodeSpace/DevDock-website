import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { FilesView } from '@/features/docs/components/FilesView'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { docsPath } from '@/features/teams/nav'

/**
 * Workspace → Files (the URL says docs): the same view as the group's, with this workspace as the
 * place (no place dropdown). WorkspaceToolGate lets it open when the Docs or Diagrams tool is on.
 */
export function WorkspaceDocsPage() {
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()
  return (
    <FilesView
      workspace={workspace}
      aside={
        <Link to={docsPath(team.slug)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          All group files <ArrowRight className="size-3" />
        </Link>
      }
    />
  )
}
