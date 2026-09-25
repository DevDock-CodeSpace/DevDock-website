import { IterationCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { cyclesPath, issuesPath } from '@/features/teams/nav'
import { cn } from '@/lib/utils'
import { ISSUE_TABS, readTab } from '../filters'

/**
 * Second-level navigation inside the Issues tab, like Linear's team views:
 * All issues · Active · Backlog · My issues, and Cycles. `actions` go on the right.
 */
export function IssuesNav({ actions }: { actions?: ReactNode }) {
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const onCycles = pathname.startsWith(cyclesPath(team.slug, workspace.id))
  const tab = onCycles ? null : readTab(params)
  const base = issuesPath(team.slug, workspace.id)
  // Switching tabs keeps the view (list/board) and the filters.
  const withTab = (id: string) => {
    const next = new URLSearchParams(onCycles ? undefined : params)
    if (id === 'all') next.delete('tab')
    else next.set('tab', id)
    const query = next.toString()
    return query ? `${base}?${query}` : base
  }

  const item = (active: boolean) =>
    cn(
      'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs whitespace-nowrap transition-colors',
      active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <nav aria-label="Issue views" className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1">
        {ISSUE_TABS.map(({ id, label }) => (
          <Link key={id} to={withTab(id)} className={item(tab === id)} aria-current={tab === id ? 'page' : undefined}>
            {label}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Link
          to={cyclesPath(team.slug, workspace.id)}
          className={item(onCycles)}
          aria-current={onCycles ? 'page' : undefined}
        >
          <IterationCw className="size-3.5" /> Cycles
        </Link>
      </nav>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
