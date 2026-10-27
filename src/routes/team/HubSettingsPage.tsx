import { useSuspenseQueries } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { SettingsSection } from '@/components/SettingsSection'
import { Button } from '@/components/ui/button'
import { useHubProjects, type HubProject } from '@/features/issues/hub/hooks'
import { importPeopleQuery, type ImportPerson } from '@/features/issues/import/api'
import { ImportPeopleList } from '@/features/issues/import/components/ImportPeopleList'
import { useCurrentTeam } from '@/features/teams/hooks'
import { workspacePath } from '@/features/teams/nav'
import { workspaceMembersQuery, type WorkspaceMember } from '@/features/workspaces/api'

/**
 * Issues hub → ⚙ Issue settings (owner's choice, 2026-10-27: importing happens every few months, so
 * it lives here rather than as a button on the hub). For each project you manage: Import issues, and
 * who the people named in imported files are. One batch for every project's lists (hubSettingsLoader).
 */
export function HubSettingsPage() {
  const managed = useHubProjects().filter((p) => p.canManage)
  if (managed.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Issue settings are for project leads and group owners/admins.</p>
  }
  return <ProjectsSettings projects={managed} />
}

function ProjectsSettings({ projects }: { projects: HubProject[] }) {
  const { team } = useCurrentTeam()
  const lists = useSuspenseQueries({
    queries: projects.flatMap((p) => [importPeopleQuery(p.id), workspaceMembersQuery(p.id)]),
  })

  return (
    <div>
      {projects.map((project, i) => {
        // Two lists per project, in order: who imported names are, then the project's people.
        const people = lists[i * 2].data as ImportPerson[]
        const members = lists[i * 2 + 1].data as WorkspaceMember[]
        return (
          <SettingsSection
            key={project.id}
            title={projects.length > 1 ? `Import into ${project.title}` : 'Import'}
            description="Bring issues in from a CSV file, or from Linear, Notion or Jira: Linear’s projects become plans. Below: who the people named in imported files are."
          >
            <div className="space-y-6">
              <Button asChild size="sm" variant="outline">
                <Link to={`${workspacePath(team.slug, project.id)}/settings/import?from=hub`}>
                  Import issues <ArrowRight />
                </Link>
              </Button>
              <ImportPeopleList workspaceId={project.id} people={people} members={members} />
            </div>
          </SettingsSection>
        )
      })}
    </div>
  )
}
