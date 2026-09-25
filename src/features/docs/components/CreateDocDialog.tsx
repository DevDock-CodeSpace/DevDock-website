import { CreateInScopeDialog } from '@/components/CreateInScopeDialog'
import { useCurrentTeam } from '@/features/teams/hooks'
import { docPath } from '@/features/teams/nav'
import { createDocument } from '../api'
import { useCanWriteDocs } from '../hooks'

/** New doc (Team-wide or a workspace). With `workspaceId` the scope is fixed. */
export function CreateDocDialog({ workspaceId }: { workspaceId?: string }) {
  const { team } = useCurrentTeam()
  return (
    <CreateInScopeDialog
      noun="doc"
      placeholder="Onboarding checklist"
      workspaceId={workspaceId}
      canWrite={useCanWriteDocs()}
      create={createDocument}
      queryKey={['documents']}
      // Open it where it was created: inside the workspace tab, or in the team view.
      pathFor={(id) => docPath(team.slug, id, workspaceId)}
    />
  )
}
