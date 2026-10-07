import { useState } from 'react'
import { PersonAvatar } from '@/components/PersonRow'
import { cn } from '@/lib/utils'
import type { Issue } from '../api'
import { breakdown, type BreakdownBy, type Metric } from '../cycleStats'
import { useIssueContext } from '../hooks'
import { labelDotClass } from '../meta'
import { PriorityIcon } from './PriorityIcon'

const TABS: { id: BreakdownBy; label: string }[] = [
  { id: 'assignee', label: 'Assignees' },
  { id: 'label', label: 'Labels' },
  { id: 'priority', label: 'Priority' },
]

/** A small completion ring. */
export function ProgressRing({ percent, className }: { percent: number; className?: string }) {
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 18 18" className={cn('size-4 shrink-0 -rotate-90', className)} aria-hidden>
      <circle cx={9} cy={9} r={r} fill="none" strokeWidth={2} className="stroke-muted" />
      <circle cx={9} cy={9} r={r} fill="none" strokeWidth={2} strokeLinecap="round" className="stroke-brand" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} />
    </svg>
  )
}

/** The issues split by assignee, label or priority, each with how much of it is done. */
export function BreakdownPanel({ issues, metric = 'issues' }: { issues: Issue[]; metric?: Metric }) {
  const { members, labels } = useIssueContext()
  const [by, setBy] = useState<BreakdownBy>('assignee')
  const rows = breakdown(issues, by, { members, labels, metric })
  return (
    <div>
      <div role="tablist" aria-label="Break down by" className="mb-2 flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={by === tab.id}
            onClick={() => setBy(tab.id)}
            className={cn(
              'h-7 rounded-full px-3 text-xs transition-colors',
              by === tab.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Nothing to break down yet.</p>
      ) : (
        <ul role="tabpanel" className="divide-y">
          {rows.map((row) => (
            <li key={row.key} className="flex h-9 items-center gap-2.5 text-sm">
              {by === 'assignee' && <PersonAvatar profile={row.profile ?? null} className="size-5" fallbackClassName="text-[9px]" />}
              {by === 'label' && <span className={cn('mx-1 size-2 shrink-0 rounded-full', row.color ? labelDotClass[row.color] : 'border border-dashed')} aria-hidden />}
              {by === 'priority' && <PriorityIcon priority={row.priority ?? 0} />}
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <ProgressRing percent={row.percent} />
              <span className="w-20 text-right font-mono text-xs text-muted-foreground">
                {row.percent}% of {row.total}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
