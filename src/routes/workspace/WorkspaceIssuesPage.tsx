import { useSuspenseQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { workspaceIssuesQuery, type IssueStatus } from '@/features/issues/api'
import { IssueCollection } from '@/features/issues/components/IssueCollection'
import { IssueFilterBar } from '@/features/issues/components/IssueFilterBar'
import { IssuesNav } from '@/features/issues/components/IssuesNav'
import { PersonViewHeader } from '@/features/issues/components/PersonViewHeader'
import { PinButton } from '@/features/issues/components/PinButton'
import { PanelToggle, SidePanelLayout } from '@/features/issues/components/SidePanel'
import { ViewActions } from '@/features/issues/components/ViewActions'
import { ViewInsights } from '@/features/issues/components/ViewInsights'
import { ViewToggle } from '@/features/issues/components/ViewToggle'
import { currentCycle } from '@/features/issues/cycles'
import { applyFilters, hasFilters, ISSUE_TABS, readTab } from '@/features/issues/filters'
import { personOf } from '@/features/issues/views'
import { useIssueContext, useIssueFilters, useIssueView } from '@/features/issues/hooks'
import { isClosed } from '@/features/issues/meta'
import { usePanelOpen } from '@/features/issues/usePanelOpen'
import { useActiveView } from '@/features/issues/viewsHooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuesPath } from '@/features/teams/nav'
import { localDateISO } from '@/lib/format'

/**
 * Workspace → Issues: Linear's team issues view. Tabs (All / Active / Backlog /
 * My issues), filters and List/Board all live in the URL; keyboard shortcuts
 * come from IssueCollection (press ? for the list).
 */
export function WorkspaceIssuesPage() {
  const { team } = useCurrentTeam()
  const { workspace, cycles, userId, members } = useIssueContext()
  const { missing, view: openView, state: viewState } = useActiveView()
  const [panelOpen, setPanelOpen] = usePanelOpen()
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
  const person = openView ? null : personOf(viewState)
  const panelTitle =
    openView?.name ??
    (person ? `${members.find((m) => m.user_id === person)?.profile?.display_name ?? 'Former member'}’s issues` : (ISSUE_TABS.find((t) => t.id === tab)?.label ?? 'All issues'))

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
            <PinButton />
            <PanelToggle open={panelOpen} onChange={setPanelOpen} />
            <ViewToggle view={view} onChange={setView} />
            <Button size="sm" onClick={() => setCreating('todo')}>
              <Plus /> New issue
            </Button>
          </>
        }
      />
      {missing && (
        <p className="mb-3 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground" role="status">
          That view doesn’t exist, or it isn’t shared with you.{' '}
          <Link to={issuesPath(team.slug, workspace.id)} className="font-medium text-foreground underline underline-offset-2">Show all issues</Link>
        </p>
      )}
      <SidePanelLayout open={panelOpen} panel={<ViewInsights title={panelTitle} view={openView} issues={issues} />}>
        <PersonViewHeader />
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <IssueFilterBar
              filters={filters}
              onChange={setFilters}
              open={filterOpen}
              onOpenChange={setFilterOpen}
            />
            <ViewActions />
          </div>
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
      </SidePanelLayout>
    </>
  )
}
