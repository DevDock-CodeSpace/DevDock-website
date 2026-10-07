import { ChevronDown, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Issue, IssueStatus } from '../api'
import { compareIssues, STATUS_ORDER, statusLabel } from '../meta'
import { subIssueStats } from '../sub-issues'
import { IssueRow } from './IssueRow'
import { StatusIcon } from './StatusIcon'

/** Rows drawn per status before "Show more", and how many each click adds. */
const PAGE_SIZE = 10

/** Linear's default list: one collapsible group per status (empty groups hidden), priority order inside. */
export function IssueList({ issues, onCreate }: { issues: Issue[]; onCreate: (status: IssueStatus) => void }) {
  const stats = subIssueStats(issues)
  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: issues.filter((i) => i.status === status).sort(compareIssues),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="border-y">
      {groups.map(({ status, items }) => (
        <IssueGroup key={status} status={status} items={items} stats={stats} onCreate={onCreate} />
      ))}
    </div>
  )
}

type IssueGroupProps = {
  status: IssueStatus
  items: Issue[]
  stats: ReturnType<typeof subIssueStats>
  onCreate: (status: IssueStatus) => void
}

/**
 * One status group. Long groups draw the first PAGE_SIZE rows and a "Show more"
 * button; after the first click the rest load as that button scrolls into view,
 * so a long list stays cheap to render without hiding anything behind paging.
 */
function IssueGroup({ status, items, stats, onCreate }: IssueGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [shown, setShown] = useState(PAGE_SIZE)
  // Only after the reader asks for more once; otherwise a group already on
  // screen would expand itself before anyone scrolled.
  const [autoLoad, setAutoLoad] = useState(false)

  const remaining = items.length - shown
  const showMore = useCallback(() => {
    setShown((count) => count + PAGE_SIZE)
    setAutoLoad(true)
  }, [])
  const moreRef = useLoadOnVisible(autoLoad && remaining > 0, showMore, shown)

  return (
    <section aria-label={statusLabel[status]}>
      <div className="flex h-9 items-center gap-2 border-b bg-muted/40 px-3">
        <button
          type="button"
          onClick={() => setCollapsed((open) => !open)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
        >
          <ChevronDown
            className={cn('size-3.5 text-muted-foreground transition-transform', collapsed && '-rotate-90')}
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
      {!collapsed && (
        <>
          <ul className="divide-y border-b last:border-b-0">
            {items.slice(0, shown).map((issue) => (
              <IssueRow key={issue.id} issue={issue} subIssues={stats.get(issue.id)} />
            ))}
          </ul>
          {remaining > 0 && (
            <button
              ref={moreRef}
              type="button"
              onClick={showMore}
              className="flex h-9 w-full items-center gap-2 border-b px-3 text-sm text-muted-foreground last:border-b-0 hover:bg-muted/50 hover:text-foreground"
            >
              <ChevronDown className="size-3.5" />
              Show {Math.min(remaining, PAGE_SIZE)} more
              {remaining > PAGE_SIZE && <span className="font-mono text-xs">({remaining} left)</span>}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Calls `onVisible` while `enabled` and the returned element is in view (or
 * nearly), so scrolling keeps loading rows without another click.
 *
 * `watch` must change with each batch: an IntersectionObserver reports
 * *crossings*, not a standing state, so a button that stays on screen after a
 * batch would never fire again. Re-observing re-checks it, and the list keeps
 * filling until the button is pushed out of view or the rows run out.
 */
function useLoadOnVisible(enabled: boolean, onVisible: () => void, watch: number) {
  const ref = useRef<HTMLButtonElement>(null)
  // Kept in a ref so a changing callback doesn't rebuild the observer.
  const latest = useRef(onVisible)
  useEffect(() => {
    latest.current = onVisible
  }, [onVisible])

  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) latest.current()
      },
      // Start the next batch a little before the button is reached.
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled, watch])

  return ref
}
