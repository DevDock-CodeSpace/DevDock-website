import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { workspaceIssuesQuery, type IssueStatus } from '@/features/issues/api'
import { IssueCollection } from '@/features/issues/components/IssueCollection'
import { IssueFilterBar } from '@/features/issues/components/IssueFilterBar'
import { IssuesNav } from '@/features/issues/components/IssuesNav'
import { ViewToggle } from '@/features/issues/components/ViewToggle'
import { currentCycle } from '@/features/issues/cycles'
import { applyFilters, hasFilters, readTab } from '@/features/issues/filters'
import { useIssueContext, useIssueFilters, useIssueView } from '@/features/issues/hooks'
import { isClosed } from '@/features/issues/meta'
import { localDateISO } from '@/lib/format'

/**
 * Workspace → Issues: Linear's team issues view. Tabs (All / Active / Backlog /
 * My issues), filters and List/Board all live in the URL; keyboard shortcuts
 * come from IssueCollection (press ? for the list).
 */
export function WorkspaceIssuesPage() {
  const { workspace, cycles, userId } = useIssueContext()
  const all = useSuspenseQuery(workspaceIssuesQuery(workspace.id)).data
  const [params] = useSearchParams()
  const [view, setView] = useIssueView()
  const [today] = useState(() => localDateISO(new Date()))
  const [creating, setCreating] = useState<IssueStatus | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  const tab = readTab(params)
  const [filters, setFilters] = useIssueFilters()
  const issues = applyFilters(all, tab, filters, { userId, currentCycleId: currentCycle(cycles, today)?.id })
  const open = issues.filter((i) => !isClosed(i.status)).length

  const empty =
    all.length === 0 ? (
      <div className="border-y py-12 text-center">
        <p className="text-sm font-medium">No issues yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Track tasks and bugs for {workspace.title}. Everyone in the workspace can create and update issues.
        </p>
        <Button size="sm" variant="outline" className="mt-4" onClick={() => setCreating('todo')}>
          <Plus /> Create the first issue <kbd className="ml-1 font-mono text-[10px] opacity-70">C</kbd>
        </Button>
      </div>
    ) : (
      <div className="border-y py-12 text-center text-sm text-muted-foreground">
        {tab === 'mine' && !hasFilters(filters) ? 'Nothing is assigned to you here.' : 'No issues match this view.'}
      </div>
    )

  return (
    <>
      <IssuesNav
        actions={
          <>
            <ViewToggle view={view} onChange={setView} />
            <Button size="sm" onClick={() => setCreating('todo')}>
              <Plus /> New issue
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <IssueFilterBar
          filters={filters}
          onChange={setFilters}
          open={filterOpen}
          onOpenChange={setFilterOpen}
        />
        <span className="font-mono text-xs text-muted-foreground" title="Open issues / issues shown">
          {open} open · {issues.length}
        </span>
      </div>
      <IssueCollection
        issues={issues}
        view={view}
        empty={empty}
        creating={creating}
        onCreatingChange={setCreating}
        shortcuts={{ f: () => setFilterOpen(true) }}
      />
    </>
  )
}
