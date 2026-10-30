import { useSuspenseQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { adminOverviewQuery } from '@/features/admin/api'
import { formatShortDate } from '@/lib/format'

/** /admin: totals across Calsko (counts only) and sign-ups per week. */
export function AdminOverviewPage() {
  const overview = useSuspenseQuery(adminOverviewQuery()).data

  const stats = [
    { label: 'Users', value: overview.users },
    { label: 'Signed in, last 7 days', value: overview.active_7d },
    { label: 'Signed in, last 30 days', value: overview.active_30d },
    { label: 'New, last 30 days', value: overview.new_30d },
    { label: 'Groups', value: overview.groups },
    { label: 'Workspaces', value: overview.workspaces },
    { label: 'Users in no group', value: overview.users_no_group },
  ]

  return (
    <>
      <PageHeader title="Overview" description="Everyone on Calsko, in numbers. Group content is never shown here." />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-b pb-6 sm:grid-cols-4 xl:grid-cols-7">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <SignupsByWeek weeks={overview.signups_by_week} />
    </>
  )
}

/** One series, so one neutral color and no legend; each bar names its week and count on hover and to screen readers. */
function SignupsByWeek({ weeks }: { weeks: { week: string; count: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count))
  const total = weeks.reduce((sum, w) => sum + w.count, 0)

  return (
    <section className="pt-6" aria-labelledby="signups-heading">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="signups-heading" className="text-sm font-semibold">
          Sign-ups per week
        </h2>
        <p className="text-xs text-muted-foreground">
          Last 12 weeks · <span className="font-mono tabular-nums">{total}</span> in all
        </p>
      </div>
      <div className="flex h-40 items-end gap-0.5 border-b" aria-hidden="true">
        {weeks.map((w) => (
          <div key={w.week} className="group relative flex h-full flex-1 items-end" title={`Week of ${formatShortDate(w.week)}: ${w.count}`}>
            <div
              className="w-full rounded-t bg-foreground/30 transition-colors group-hover:bg-foreground/60"
              style={{ height: w.count === 0 ? 0 : `${Math.max(2, (w.count / max) * 100)}%` }}
            />
            {w.count > 0 && (
              <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 font-mono text-[11px] text-foreground group-hover:block">
                {w.count}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground" aria-hidden="true">
        <span>{weeks[0] && formatShortDate(weeks[0].week)}</span>
        <span>This week</span>
      </div>
      <table className="sr-only">
        <caption>Sign-ups per week, last 12 weeks</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Sign-ups</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <td>{formatShortDate(w.week)}</td>
              <td>{w.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
