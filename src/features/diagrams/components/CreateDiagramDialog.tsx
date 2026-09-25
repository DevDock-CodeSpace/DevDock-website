import { CreateInScopeDialog } from '@/components/CreateInScopeDialog'
import { useCurrentTeam } from '@/features/teams/hooks'
import { diagramPath } from '@/features/teams/nav'
import { createDiagram } from '../api'
import { useCanWriteDiagrams } from '../hooks'

/** New diagram (Team-wide or a workspace). With `workspaceId` the scope is fixed. */
export function CreateDiagramDialog({ workspaceId }: { workspaceId?: string }) {
  const { team } = useCurrentTeam()
  return (
    <CreateInScopeDialog
      noun="diagram"
      placeholder="System architecture"
      workspaceId={workspaceId}
      canWrite={useCanWriteDiagrams()}
      create={createDiagram}
      queryKey={['diagrams']}
      pathFor={(id) => diagramPath(team.slug, id, workspaceId)}
    />
  )
}
