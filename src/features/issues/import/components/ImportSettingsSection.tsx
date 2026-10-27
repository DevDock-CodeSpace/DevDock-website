import { useSuspenseQueries } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { SettingsSection } from '@/components/SettingsSection'
import { Button } from '@/components/ui/button'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { workspacePath } from '@/features/teams/nav'
import { workspaceMembersQuery } from '@/features/workspaces/api'
import { importPeopleQuery } from '../api'
import { ImportPeopleList } from './ImportPeopleList'

/**
 * Project settings → Import: the way into importing issues, and who each name from imported files
 * is mapped to (the same list as the Issues hub's settings). Managers only (the page checks).
 */
export function ImportSettingsSection() {
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()
  // One batch with the people list the selects need (both prefetched by the settings loader).
  const [{ data: people }, { data: members }] = useSuspenseQueries({
    queries: [importPeopleQuery(workspace.id), workspaceMembersQuery(workspace.id)],
  })

  return (
    <SettingsSection
      title="Import"
      description="Bring issues in from a CSV file, or from Linear, Notion or Jira. Below: who the people named in imported files are."
    >
      <div className="space-y-6">
        <Button asChild size="sm" variant="outline">
          <Link to={`${workspacePath(team.slug, workspace.id)}/settings/import`}>
            Import issues <ArrowRight />
          </Link>
        </Button>
        <ImportPeopleList workspaceId={workspace.id} people={people} members={members} />
      </div>
    </SettingsSection>
  )
}
