import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/hooks'
import { useCollectionView } from '@/features/collections/hooks'
import { teamIssuesQuery, type TeamIssue } from '@/features/issues/api'
import { IssueList } from '@/features/issues/components/IssueList'
import { TeamIssueRow } from '@/features/issues/components/TeamIssueRow'
import { applyFilters, ISSUE_TABS, NO_FILTERS, readTab } from '@/features/issues/filters'
import { useUpdateTeamIssue } from '@/features/issues/hooks'
import { isClosed } from '@/features/issues/meta'
import { useCurrentTeam } from '@/features/teams/hooks'
import { hasTeamIssues, teamIssuesPath } from '@/features/teams/nav'
import { cn } from '@/lib/utils'

const ALL = 'all'

/**
 * Group → Issues (groups with a project): issues from every project you can see,
 * grouped by status. Tabs (All / Active / Backlog / My issues) and a project
 * filter live in the URL. Rows are the project list's rows (`TeamIssueRow`): they open
 * the issue inside its project, and their menus save through `useUpdateTeamIssue`.
 */
export function TeamIssuesPage() {
  const { user } = useAuth()
  const { team } = useCurrentTeam()
  // Inside a collection the page covers that collection's projects only.
  const { collection, workspaces, inView } = useCollectionView()
  const all = useSuspenseQuery(teamIssuesQuery(team.id)).data.filter((issue) => inView(issue.workspace.id))
  const where = collection ? collection.name : team.name
  const [params, setParams] = useSearchParams()
  const update = useUpdateTeamIssue(team.id)

  if (!hasTeamIssues(collection?.type ?? team.type, workspaces)) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Issues from every project show here once {where} has a project.
      </p>
    )
  }

  const tab = readTab(params)
  const project = params.get('project') ?? ALL
  const projects = [...new Map(all.map((i) => [i.workspace.id, i.workspace])).values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  )
  const scoped = project === ALL ? all : all.filter((i) => i.workspace.id === project)
  const issues = applyFilters(scoped, tab, NO_FILTERS, { userId: user.id, currentCycleId: undefined }) as TeamIssue[]
  const open = issues.filter((i) => !isClosed(i.status)).length

  const tabHref = (id: string) => {
    const next = new URLSearchParams(params)
    if (id === 'all') next.delete('tab')
    else next.set('tab', id)
    const q = next.toString()
    return q ? `${teamIssuesPath(team.slug)}?${q}` : teamIssuesPath(team.slug)
  }

  return (
    <>
      <PageHeader title="Issues" description={`Issues from every project in ${where} you can access.`} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Issue views" className="flex items-center gap-0.5">
          {ISSUE_TABS.map(({ id, label }) => (
            <Link
              key={id}
              to={tabHref(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                tab === id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {projects.length > 1 && (
            <Select
              value={project}
              onValueChange={(value) =>
                setParams(
                  (p) => {
                    if (value === ALL) p.delete('project')
                    else p.set('project', value)
                    return p
                  },
                  { replace: true },
                )
              }
            >
              <SelectTrigger size="sm" className="h-7 min-w-40 text-xs" aria-label="Project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="font-mono text-xs text-muted-foreground">
            {open} open · {issues.length}
          </span>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="border-y py-12 text-center text-sm text-muted-foreground">
          {all.length === 0
            ? 'No issues yet. Open a project and use its Issues tab to create one.'
            : tab === 'mine'
              ? 'Nothing is assigned to you.'
              : 'No issues match this view.'}
        </div>
      ) : (
        <IssueList
          issues={issues}
          row={(issue, subIssues) => (
            <TeamIssueRow
              issue={issue}
              subIssues={subIssues}
              teamSlug={team.slug}
              userId={user.id}
              showProject={projects.length > 1}
              update={(issue, patch) => update.mutate({ issue, patch })}
            />
          )}
        />
      )}
    </>
  )
}
