import { useSuspenseQuery } from '@tanstack/react-query'
import { Globe } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { useCurrentTeam } from '@/features/teams/hooks'
import { teamToolDefs, workspacePath, workspaceTabDefs, type TeamToolId } from '@/features/teams/nav'
import { workspaceTypes } from '@/features/teams/permissions'
import { teamWorkspacesQuery } from '@/features/workspaces/api'

/**
 * Team → Docs / Diagrams / Live: the team-wide view (team-wide items plus
 * items assigned to any workspace the caller can see). Not built yet, so this
 * is an empty state plus where items will come from.
 */
export function TeamToolPage({ tool }: { tool: TeamToolId }) {
  const { team } = useCurrentTeam()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const { title, icon: Icon } = workspaceTabDefs[tool]
  const { item, items } = teamToolDefs[tool]
  const sources = workspaces.filter((w) => w.modules.includes(tool))
  const off = workspaces.length - sources.length

  return (
    <>
      <PageHeader
        title={title}
        description={`All ${items} in ${team.name} you can access: team-wide ones and those assigned to a workspace.`}
      />

      <div className="max-w-3xl space-y-10">
        <div className="flex items-start gap-4 border-b pt-2 pb-8">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
            <Icon className="size-4" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">
              No {items} yet{' '}
              <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">coming soon</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {title} isn’t built yet. Once it is, this page lists every {item} in the team. A
              workspace’s {title} tab shows only the {items} assigned to it.
            </p>
          </div>
        </div>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Where {items} will come from</h2>
            <span className="font-mono text-xs text-muted-foreground">{sources.length + 1}</span>
          </div>
          <ul className="divide-y border-y">
            <li className="flex items-center gap-3 px-1 py-2.5 text-sm">
              <Globe className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">Team-wide</span>
              <span className="hidden truncate text-muted-foreground sm:inline">Not assigned to any workspace</span>
              <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">0</span>
            </li>
            {sources.map((workspace) => {
              const { label, icon: TypeIcon } = workspaceTypes[workspace.type]
              return (
                <li key={workspace.id}>
                  <Link
                    to={`${workspacePath(team.slug, workspace.id)}/${tool}`}
                    className="flex items-center gap-3 px-1 py-2.5 text-sm transition-colors hover:bg-muted/50"
                  >
                    <TypeIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{workspace.title}</span>
                    <span className="hidden text-muted-foreground sm:inline">{label}</span>
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">0</span>
                  </Link>
                </li>
              )
            })}
          </ul>
          {off > 0 && (
            <p className="text-xs text-muted-foreground">
              {off} {off === 1 ? 'workspace has' : 'workspaces have'} the {title} tool turned off.
            </p>
          )}
        </section>
      </div>
    </>
  )
}
