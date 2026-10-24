import { CreateInScopeDialog } from '@/components/CreateInScopeDialog'
import { useCurrentTeam } from '@/features/teams/hooks'
import { docPath } from '@/features/teams/nav'
import { createDocument } from '../api'
import { useCanEditDocs } from '../hooks'

/**
 * New doc. With `workspaceId` the scope is that workspace; with `folderId`
 * it's created in that folder (whose scope is fixed: the workspace's, or
 * group-wide when `workspaceId` is omitted). `open`/`onOpenChange` open it
 * from a "New" menu instead of its own button.
 */
export function CreateDocDialog({
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
      noun="doc"
      placeholder="Onboarding checklist"
      workspaceId={workspaceId}
      groupWideOnly={!workspaceId && !!folderId}
      canWrite={useCanEditDocs()}
      create={(input) => createDocument({ ...input, folderId: folderId ?? null })}
      queryKeys={[['documents', 'team'], ['documents', 'workspace']]}
      table="documents"
      // Open it where it was created: inside the workspace tab, or in the team view.
      pathFor={(id) => docPath(team.slug, id, workspaceId)}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}
