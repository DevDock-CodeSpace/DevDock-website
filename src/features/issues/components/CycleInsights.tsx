import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { cycleHistoryQuery, type Issue, type IssueCycle } from '../api'
import { cycleSeries, cycleTotals, hasEstimates, share, type Metric } from '../cycleStats'
import { cycleState } from '../cycles'
import { BreakdownPanel } from './BreakdownPanel'
import { BurnupChart } from './BurnupChart'

const stateLabel = { current: 'Current', upcoming: 'Upcoming', past: 'Past' } as const

/** The details panel of a cycle page: dates, scope / started / completed, the burn-up chart and the breakdowns. */
export function CycleInsights({ cycle, issues, today }: { cycle: IssueCycle; issues: Issue[]; today: string }) {
  const [metric, setMetric] = useState<Metric>('issues')
  const points = hasEstimates(issues)
  const effective: Metric = points ? metric : 'issues'
  const history = useQuery(cycleHistoryQuery(cycle.workspace_id, cycle.id, issues.map((issue) => issue.id))).data
  const totals = cycleTotals(issues, effective)
  const series = useMemo(
    () =>
      cycleSeries({
        cycle,
        today,
        // The issues in the cycle now, plus the ones that were taken out of it along the way.
        issues: [...issues, ...(history?.extra ?? [])],
        events: history?.events ?? [],
        metric: effective,
      }),
    [cycle, today, issues, history, effective],
  )
  const state = cycleState(cycle, today)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className={cn('rounded-md px-2 py-0.5 text-xs', state === 'current' ? 'bg-brand/10 font-medium text-brand' : 'bg-muted text-muted-foreground')}>
          {stateLabel[state]}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {formatDate(cycle.starts_on)} → {formatDate(cycle.ends_on)}
        </span>
      </div>

      <section aria-label="Progress">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">Progress</h3>
          {points && (
            <div role="group" aria-label="Count by" className="flex rounded-md border p-0.5 text-xs">
              {(['issues', 'points'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={effective === option}
                  onClick={() => setMetric(option)}
                  className={cn('rounded px-2 py-0.5 capitalize', effective === option ? 'bg-muted font-medium' : 'text-muted-foreground')}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
        <dl className="mb-4 grid grid-cols-3 gap-2 text-sm">
          <Stat swatch="bg-muted-foreground" label="Scope" value={totals.scope} />
          <Stat swatch="bg-amber-500" label="Started" value={totals.started} sub={`${share(totals.started, totals.scope)}%`} />
          <Stat swatch="bg-brand" label="Completed" value={totals.completed} sub={`${share(totals.completed, totals.scope)}%`} />
        </dl>
        <BurnupChart series={series} unit={effective} />
      </section>

      <BreakdownPanel issues={issues} metric={effective} />
    </div>
  )
}

function Stat({ swatch, label, value, sub }: { swatch: string; label: string; value: number; sub?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`size-2 rounded-sm ${swatch}`} aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-mono text-base">{value}</span>
        {sub && <span className="font-mono text-xs text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  )
}
