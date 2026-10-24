import { CreateInScopeDialog } from '@/components/CreateInScopeDialog'
import { useCurrentTeam } from '@/features/teams/hooks'
import { diagramPath } from '@/features/teams/nav'
import { createDiagram } from '../api'
import { useCanWriteDiagrams } from '../hooks'

/**
 * New diagram (Team-wide or a workspace). With `workspaceId` the scope is fixed; with `folderId`
 * it's created in that folder (group-wide when `workspaceId` is omitted), like a new doc.
 * `open`/`onOpenChange` open it from a "New" menu instead of its own button.
 */
export function CreateDiagramDialog({
  workspaceId,
  folderId,
  open,
  onOpenChange,
}: {
  workspaceId?: string
  folderId?: string | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { team } = useCurrentTeam()
  return (
    <CreateInScopeDialog
      noun="diagram"
      placeholder="System architecture"
      workspaceId={workspaceId}
      groupWideOnly={!workspaceId && !!folderId}
      canWrite={useCanWriteDiagrams()}
      create={(input) => createDiagram({ ...input, folderId: folderId ?? null })}
      queryKeys={[['diagrams', 'team'], ['diagrams', 'workspace']]}
      table="diagrams"
      pathFor={(id) => diagramPath(team.slug, id, workspaceId)}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}
