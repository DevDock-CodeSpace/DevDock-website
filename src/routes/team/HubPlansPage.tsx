import { useSuspenseQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PersonAvatar } from '@/components/PersonRow'
import { Segmented } from '@/features/issues/hub/components/Segmented'
import { teamIssuesQuery } from '@/features/issues/api'
import { teamPlansQuery, type Plan } from '@/features/plans/api'
import { PlanStatusDot } from '@/features/plans/components/PlanStatusDot'
import { ProgressRing } from '@/features/plans/components/ProgressRing'
import { isPlanOpen, PLAN_STATUS_ORDER, planStatusLabel, planStatusTile } from '@/features/plans/meta'
import { issuesByPlan, planProgress } from '@/features/plans/progress'
import { teamMembersQuery } from '@/features/teams/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import { planPath } from '@/features/teams/nav'
import { formatShortDate, localDateISO } from '@/lib/format'
import { cn } from '@/lib/utils'

const SHOWS = [
  { id: 'active', label: 'Active' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
] as const
type Show = (typeof SHOWS)[number]['id']

const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 md:grid-cols-[minmax(0,1fr)_10rem_6.5rem_5rem_7.5rem]'

/**
 * Issues hub → Plans: every plan in the group (plans aren't narrowed by the collection view),
 * grouped by status, with lead, target date and progress from the issues the reader can see. The
 * Brief's first line comes with the list (brief_excerpt): no extra request.
 */
export function HubPlansPage() {
  const { team } = useCurrentTeam()
  const [{ data: plans }, { data: issues }, { data: people }] = useSuspenseQueries({
    queries: [teamPlansQuery(team.id), teamIssuesQuery(team.id), teamMembersQuery(team.id)],
  })
  const [params, setParams] = useSearchParams()
  const [today] = useState(() => localDateISO(new Date()))
  const [soon] = useState(() => localDateISO(new Date(Date.now() + 7 * 864e5)))
  const byPlan = issuesByPlan(issues)
  const show = (SHOWS.find((s) => s.id === params.get('show'))?.id ?? 'active') as Show
  const shown = plans.filter((p) => show === 'all' || (show === 'active') === isPlanOpen(p))
  const groups = PLAN_STATUS_ORDER.map((status) => ({ status, plans: shown.filter((p) => p.status === status).sort(byTarget) })).filter((g) => g.plans.length > 0)
  const active = plans.filter(isPlanOpen).length

  if (plans.length === 0) {
    return (
      <div className="border-y py-12 text-center">
        <p className="text-sm font-medium">No plans yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          A plan is a goal, like “Custom auth roles”: put issues from any project in it and follow its progress. Use New plan above.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          label="Which plans"
          options={SHOWS}
          value={show}
          onChange={(id) =>
            setParams(
              (p) => {
                if (id === 'active') p.delete('show')
                else p.set('show', id)
                return p
              },
              { replace: true },
            )
          }
        />
        <span className="flex-1" />
        <span className="font-mono text-xs text-muted-foreground">
          {active} active · {plans.length}
        </span>
      </div>

      <div className="border-t">
        <div className={cn(GRID, 'h-8 border-b px-3 text-[11px] tracking-wide text-muted-foreground uppercase')}>
          <span>Plan</span>
          <span className="hidden md:block">Lead</span>
          <span className="hidden md:block">Target</span>
          <span className="hidden md:block">Issues</span>
          <span>Progress</span>
        </div>
        {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No {show === 'done' ? 'finished' : 'active'} plans.</p>}
        {groups.map((group) => (
          <section key={group.status} aria-label={planStatusLabel[group.status]}>
            <div className="flex h-9 items-center gap-2 border-b bg-muted/30 px-3 text-sm">
              <PlanStatusDot status={group.status} />
              <span className="font-medium">{planStatusLabel[group.status]}</span>
              <span className="font-mono text-xs text-muted-foreground">{group.plans.length}</span>
            </div>
            <ul>
              {group.plans.map((plan) => {
                const lead = people.find((p) => p.user_id === plan.lead_id)
                const progress = planProgress(byPlan.get(plan.id) ?? [])
                const near = isPlanOpen(plan) && plan.target_on !== null && plan.target_on <= soon
                return (
                  <li key={plan.id} className={cn(GRID, 'relative min-h-14 border-b px-3 py-2 transition-colors hover:bg-muted/40')}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', planStatusTile[plan.status])}>
                        <PlanStatusDot status={plan.status} />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <Link to={planPath(team.slug, plan.id)} className="truncate text-sm font-medium after:absolute after:inset-0">
                          {plan.name}
                        </Link>
                        {plan.brief_excerpt && <span className="truncate text-xs text-muted-foreground">{plan.brief_excerpt}</span>}
                      </span>
                    </div>
                    <span className="hidden min-w-0 items-center gap-2 text-sm md:flex">
                      {lead ? (
                        <>
                          <PersonAvatar profile={lead.profile} className="size-5" />
                          <span className="truncate">{lead.profile?.display_name ?? 'Member'}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">No lead</span>
                      )}
                    </span>
                    <span className={cn('hidden font-mono text-xs md:block', near ? (plan.target_on! < today ? 'text-red-500' : 'text-amber-500') : 'text-muted-foreground')}>
                      {plan.target_on ? formatShortDate(plan.target_on) : '—'}
                    </span>
                    <span className="hidden font-mono text-xs text-muted-foreground md:block">
                      {progress.done} / {progress.total}
                    </span>
                    <span className="flex items-center gap-2">
                      <ProgressRing ratio={progress.ratio} />
                      <span className="font-mono text-xs">{Math.round(progress.ratio * 100)}%</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

/** Soonest target first; plans without one after, by name. */
function byTarget(a: Plan, b: Plan) {
  if (a.target_on && b.target_on) return a.target_on.localeCompare(b.target_on) || a.name.localeCompare(b.name)
  if (a.target_on) return -1
  if (b.target_on) return 1
  return a.name.localeCompare(b.name)
}
