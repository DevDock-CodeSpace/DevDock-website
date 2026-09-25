import { useSuspenseQuery } from '@tanstack/react-query'
import { CircleUserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { PersonAvatar } from '@/components/PersonRow'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/hooks'
import { teamIssuesQuery, type TeamIssue } from '@/features/issues/api'
import { PriorityIcon } from '@/features/issues/components/PriorityIcon'
import { StatusIcon } from '@/features/issues/components/StatusIcon'
import { applyFilters, ISSUE_TABS, readTab } from '@/features/issues/filters'
import { compareIssues, isClosed, issueIdentifier, STATUS_ORDER, statusLabel } from '@/features/issues/meta'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuePath, teamIssuesPath } from '@/features/teams/nav'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

const ALL = 'all'
const noFilters = { status: [], priority: [], assignee: [], label: [], cycle: [] }

/**
 * Group → Issues (development groups): issues from every project you can see,
 * grouped by status. Tabs (All / Active / Backlog / My issues) and a project
 * filter live in the URL. Rows open the issue inside its project, where it's edited.
 */
export function TeamIssuesPage() {
  const { user } = useAuth()
  const { team } = useCurrentTeam()
  const all = useSuspenseQuery(teamIssuesQuery(team.id)).data
  const [params, setParams] = useSearchParams()
  const [now] = useState(Date.now)

  if (team.type !== 'development') {
    return <p className="py-16 text-center text-sm text-muted-foreground">Issues across projects are for development groups.</p>
  }

  const tab = readTab(params)
  const project = params.get('project') ?? ALL
  const projects = [...new Map(all.map((i) => [i.workspace.id, i.workspace])).values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  )
  const scoped = project === ALL ? all : all.filter((i) => i.workspace.id === project)
  const issues = applyFilters(scoped, tab, noFilters, { userId: user.id, currentCycleId: undefined }) as TeamIssue[]
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
      <PageHeader title="Issues" description={`Issues from every project in ${team.name} you can access.`} />

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
        <div className="border-y">
          {STATUS_ORDER.map((status) => {
            const items = issues.filter((i) => i.status === status).sort(compareIssues)
            if (items.length === 0) return null
            return (
              <section key={status} aria-label={statusLabel[status]}>
                <div className="flex h-9 items-center gap-2 border-b bg-muted/40 px-3 text-sm">
                  <StatusIcon status={status} />
                  <span className="font-medium">{statusLabel[status]}</span>
                  <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
                </div>
                <ul className="divide-y border-b last:border-b-0">
                  {items.map((issue) => (
                    <li key={issue.id} className="relative flex h-10 items-center gap-3 px-3 text-sm hover:bg-muted/50">
                      <PriorityIcon priority={issue.priority} />
                      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                        {issueIdentifier(issue.workspace.issue_key, issue.number)}
                      </span>
                      <StatusIcon status={issue.status} />
                      <Link
                        to={issuePath(team.slug, issue.workspace.id, issue.number)}
                        className={cn(
                          'min-w-0 flex-1 truncate font-medium outline-none after:absolute after:inset-0',
                          isClosed(issue.status) && 'text-muted-foreground',
                        )}
                      >
                        {issue.title}
                      </Link>
                      <span className="hidden max-w-40 shrink-0 truncate rounded-full border px-2 text-[11px] text-muted-foreground sm:inline">
                        {issue.workspace.title}
                      </span>
                      {issue.assignee ? (
                        <PersonAvatar profile={issue.assignee} className="size-5" />
                      ) : (
                        <CircleUserRound className="size-4 shrink-0 text-muted-foreground/60" />
                      )}
                      <span className="hidden w-20 shrink-0 text-right font-mono text-[11px] whitespace-nowrap text-muted-foreground sm:inline">
                        {timeAgo(issue.updated_at, now)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
