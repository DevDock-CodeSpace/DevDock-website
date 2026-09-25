import { useSuspenseQuery } from '@tanstack/react-query'
import { Workflow } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { teamDiagramsQuery } from '@/features/diagrams/api'
import { CreateDiagramDialog } from '@/features/diagrams/components/CreateDiagramDialog'
import { DocList } from '@/features/docs/components/DocList'
import { useCurrentTeam } from '@/features/teams/hooks'
import { diagramPath } from '@/features/teams/nav'

/** Team → Diagrams: team-wide diagrams plus diagrams from every workspace the user can see (RLS). */
export function TeamDiagramsPage() {
  const { team, can } = useCurrentTeam()
  const diagrams = useSuspenseQuery(teamDiagramsQuery(team.id)).data

  return (
    <>
      <PageHeader
        title="Diagrams"
        description={`Team-wide diagrams in ${team.name}, plus diagrams from the workspaces you can access.`}
      >
        <CreateDiagramDialog />
      </PageHeader>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">All diagrams</h2>
        <span className="font-mono text-xs text-muted-foreground">{diagrams.length}</span>
      </div>
      <DocList
        docs={diagrams}
        icon={Workflow}
        showScope
        href={(diagram) => diagramPath(team.slug, diagram.id)}
        empty={
          can.isAdmin
            ? 'No diagrams yet. Create a team-wide diagram, or one for a workspace.'
            : 'No diagrams yet. Team owners/admins draw team-wide diagrams; workspace leads draw diagrams for their workspace.'
        }
      />
    </>
  )
}
