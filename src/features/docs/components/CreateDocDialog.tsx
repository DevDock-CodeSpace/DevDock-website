import { CreateInScopeDialog } from '@/components/CreateInScopeDialog'
import { useCurrentTeam } from '@/features/teams/hooks'
import { docPath } from '@/features/teams/nav'
import { createDocument } from '../api'
import { useCanWriteDocs } from '../hooks'

/**
 * New doc. With `workspaceId` the scope is that workspace; with `folderId`
 * it's created in that folder (whose scope is fixed: the workspace's, or
 * group-wide when `workspaceId` is omitted).
 */
export function CreateDocDialog({ workspaceId, folderId }: { workspaceId?: string; folderId?: string | null }) {
  const { team } = useCurrentTeam()
  return (
    <CreateInScopeDialog
      noun="doc"
      placeholder="Onboarding checklist"
      workspaceId={workspaceId}
      groupWideOnly={!workspaceId && !!folderId}
      canWrite={useCanWriteDocs()}
      create={(input) => createDocument({ ...input, folderId: folderId ?? null })}
      queryKey={['documents']}
      // Open it where it was created: inside the workspace tab, or in the team view.
      pathFor={(id) => docPath(team.slug, id, workspaceId)}
    />
  )
}
