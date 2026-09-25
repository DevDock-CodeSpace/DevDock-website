import { ChevronDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Issue, IssueStatus } from '../api'
import { compareIssues, STATUS_ORDER, statusLabel } from '../meta'
import { subIssueStats } from '../sub-issues'
import { IssueRow } from './IssueRow'
import { StatusIcon } from './StatusIcon'

/** Linear's default list: one collapsible group per status (empty groups hidden), priority order inside. */
export function IssueList({ issues, onCreate }: { issues: Issue[]; onCreate: (status: IssueStatus) => void }) {
  const [collapsed, setCollapsed] = useState<Set<IssueStatus>>(new Set())
  const stats = subIssueStats(issues)
  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: issues.filter((i) => i.status === status).sort(compareIssues),
  })).filter((g) => g.items.length > 0)

  const toggle = (status: IssueStatus) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })

  return (
    <div className="border-y">
      {groups.map(({ status, items }) => {
        const isCollapsed = collapsed.has(status)
        return (
          <section key={status} aria-label={statusLabel[status]}>
            <div className="flex h-9 items-center gap-2 border-b bg-muted/40 px-3">
              <button
                type="button"
                onClick={() => toggle(status)}
                aria-expanded={!isCollapsed}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              >
                <ChevronDown
                  className={cn('size-3.5 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')}
                />
                <StatusIcon status={status} />
                <span className="font-medium">{statusLabel[status]}</span>
                <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
              </button>
              <button
                type="button"
                onClick={() => onCreate(status)}
                aria-label={`New issue in ${statusLabel[status]}`}
                className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            {!isCollapsed && (
              <ul className="divide-y border-b last:border-b-0">
                {items.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} subIssues={stats.get(issue.id)} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
