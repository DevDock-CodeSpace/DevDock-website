import { useSuspenseQuery } from '@tanstack/react-query'
import { Lock, Users } from 'lucide-react'
import { Link } from 'react-router'
import { useHubProjects } from '@/features/issues/hub/hooks'
import { viewHref } from '@/features/issues/views'
import { teamViewsQuery } from '@/features/issues/viewsApi'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuesPath } from '@/features/teams/nav'

/**
 * Issues hub → Views: the saved views you can see in every project (yours, and those shared with
 * the project), each opening in its project. Save new ones from a project's Issues page.
 */
export function HubViewsPage() {
  const { team } = useCurrentTeam()
  const projects = useHubProjects()
  const views = useSuspenseQuery(teamViewsQuery(team.id)).data.filter((v) => projects.some((p) => p.id === v.workspace_id))
  const project = (id: string) => projects.find((p) => p.id === id)

  if (views.length === 0) {
    return (
      <div className="border-y py-12 text-center">
        <p className="text-sm font-medium">No saved views yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          On a project’s Issues page, set the filters you want, then save them as a view. Shared views show here for everyone in the project.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y border-y">
      {[...views]
        .sort((a, b) => Number(b.shared) - Number(a.shared) || a.name.localeCompare(b.name))
        .map((view) => (
          <li key={view.id} className="relative flex items-center gap-3 py-2 hover:bg-muted/40">
            {view.shared ? <Users className="size-4 shrink-0 text-muted-foreground" aria-label="Shared" /> : <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Only you" />}
            <Link to={viewHref(issuesPath(team.slug, view.workspace_id), view)} className="min-w-0 flex-1 truncate text-sm font-medium after:absolute after:inset-0">
              {view.name}
            </Link>
            {projects.length > 1 && <span className="shrink-0 text-xs text-muted-foreground">{project(view.workspace_id)?.title}</span>}
          </li>
        ))}
    </ul>
  )
}
