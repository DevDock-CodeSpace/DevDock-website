import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PersonAvatar } from '@/components/PersonRow'
import { useAuth } from '@/features/auth/hooks'
import { projectsCyclesQuery, teamIssuesQuery, type IssueCycle, type TeamIssue } from '@/features/issues/api'
import { TeamIssueRow } from '@/features/issues/components/TeamIssueRow'
import { cycleState, cycleTitle } from '@/features/issues/cycles'
import { useHubProjects } from '@/features/issues/hub/hooks'
import { useUpdateTeamIssue } from '@/features/issues/hooks'
import { compareIssues } from '@/features/issues/meta'
import { teamPlansQuery } from '@/features/plans/api'
import { PlanProgressBar } from '@/features/plans/components/PlanProgressBar'
import { planProgress } from '@/features/plans/progress'
import { useCurrentTeam } from '@/features/teams/hooks'
import { cyclePath, cyclesPath } from '@/features/teams/nav'
import { teamWorkspacesQuery } from '@/features/workspaces/api'
import { formatShortDate, localDateISO } from '@/lib/format'

/**
 * Issues hub → Sprints: for each project, the sprint that's running (or the next one), with its
 * issues by person, so a lead sees who is doing what. Sprints belong to projects (owner's choice);
 * they're set up on the project's Sprints page. One request for every project's sprints.
 */
export function HubSprintsPage() {
  const { team } = useCurrentTeam()
  const projects = useHubProjects()
  const [today] = useState(() => localDateISO(new Date()))
  // Every project's sprints in the group (the loader's key); the page shows the collection view's.
  const allProjects = useSuspenseQuery(teamWorkspacesQuery(team.id)).data.filter((w) => w.modules.includes('issues')).map((w) => w.id)
  const [{ data: cycles }, { data: issues }, { data: plans }] = useSuspenseQueries({
    queries: [projectsCyclesQuery(allProjects), teamIssuesQuery(team.id), teamPlansQuery(team.id)],
  })

  if (projects.length === 0) return <p className="py-12 text-center text-sm text-muted-foreground">No project uses Issues yet.</p>

  return (
    <div className="space-y-8">
      {projects.map((project) => {
        const own = cycles.filter((c) => c.workspace_id === project.id)
        const sprint = own.find((c) => cycleState(c, today) === 'current') ?? own.find((c) => cycleState(c, today) === 'upcoming')
        return (
          <section key={project.id} aria-label={project.title}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-1.5">
              <h3 className="text-sm font-semibold">
                {projects.length > 1 && <span className="text-muted-foreground">{project.title} · </span>}
                {sprint ? (
                  <Link to={cyclePath(team.slug, project.id, sprint.number)} className="hover:underline">
                    {cycleTitle(sprint)}
                  </Link>
                ) : (
                  'No sprint running'
                )}
                {sprint && (
                  <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                    {cycleState(sprint, today) === 'upcoming' ? 'starts ' : ''}
                    {formatShortDate(sprint.starts_on)} – {formatShortDate(sprint.ends_on)}
                  </span>
                )}
              </h3>
              <Link to={cyclesPath(team.slug, project.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                {project.canManage ? 'Set up sprints' : 'All sprints'} <ArrowRight className="size-3" />
              </Link>
            </div>
            {sprint ? <SprintPeople sprint={sprint} issues={issues.filter((i) => i.cycle_id === sprint.id)} plans={plans} /> : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {project.canManage ? 'Plan the next sprint on the project’s Sprints page.' : 'Your lead hasn’t planned the next sprint yet.'}
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}

function SprintPeople({ sprint, issues, plans }: { sprint: IssueCycle; issues: TeamIssue[]; plans: Parameters<typeof TeamIssueRow>[0]['plans'] }) {
  const { user } = useAuth()
  const { team } = useCurrentTeam()
  const update = useUpdateTeamIssue(team.id)
  const progress = planProgress(issues)
  if (issues.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No issues in {cycleTitle(sprint)} yet.</p>

  // People with work first (most first), then what nobody has taken.
  const groups = new Map<string, TeamIssue[]>()
  for (const issue of issues) groups.set(issue.assignee_id ?? '', [...(groups.get(issue.assignee_id ?? '') ?? []), issue])
  const ordered = [...groups].sort(([a, x], [b, y]) => Number(a === '') - Number(b === '') || y.length - x.length)

  return (
    <div className="mt-2 space-y-3">
      <PlanProgressBar done={progress.done} total={progress.total} />
      {ordered.map(([assignee, list]) => (
        <div key={assignee || 'nobody'}>
          <div className="flex items-center gap-2 pb-0.5 text-xs">
            {assignee ? <PersonAvatar profile={list[0].assignee} className="size-4" /> : null}
            <span className="font-medium">{assignee ? (list[0].assignee?.display_name ?? 'Member') : 'Nobody yet'}</span>
            <span className="font-mono text-muted-foreground">
              {list.filter((i) => i.status === 'done').length}/{list.length}
            </span>
          </div>
          <div className="border-y">
            {[...list].sort(compareIssues).map((issue) => (
              <TeamIssueRow
                key={issue.id}
                issue={issue}
                teamSlug={team.slug}
                userId={user.id}
                showProject={false}
                plans={plans}
                update={(i, patch) => update.mutate({ issue: i, patch })}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
