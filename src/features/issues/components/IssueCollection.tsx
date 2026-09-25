import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuePath } from '@/features/teams/nav'
import type { Issue, IssueStatus } from '../api'
import { useIssueContext, useUpdateIssue } from '../hooks'
import { IssueNavContext, type MenuKind } from '../nav-context'
import { moveIssueFocus, useShortcuts } from '../shortcuts'
import { CreateIssueDialog } from './CreateIssueDialog'
import { IssueBoard } from './IssueBoard'
import { IssueList } from './IssueList'
import { ShortcutsDialog } from './ShortcutsDialog'

type IssueCollectionProps = {
  issues: Issue[]
  view: 'list' | 'board'
  /** Shown instead of the list when there are no issues to show. */
  empty: ReactNode
  /** New issues start in this cycle (a cycle's page). */
  cycleId?: string | null
  /** Page-specific shortcuts (e.g. F for the filter menu). */
  shortcuts?: Record<string, () => void>
  /** The create dialog: open in a status, or closed (null). The page's "New issue" button opens it too. */
  creating: IssueStatus | null
  onCreatingChange: (status: IssueStatus | null) => void
}

/**
 * A set of issues as a List or Board, with Linear's keyboard model: C creates,
 * J/K (↓/↑) or hover focus a row, Enter opens it, S/P/A/L/⇧C open its status,
 * priority, assignee, labels or cycle menu, I assigns it to you, ? shows help.
 */
export function IssueCollection({
  issues,
  view,
  empty,
  cycleId,
  shortcuts,
  creating,
  onCreatingChange: setCreating,
}: IssueCollectionProps) {
  const { team } = useCurrentTeam()
  const { workspace, userId } = useIssueContext()
  const update = useUpdateIssue()
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ issueId: string; kind: MenuKind } | null>(null)
  const [help, setHelp] = useState(false)

  const active = issues.find((i) => i.id === activeId)
  const open = (kind: MenuKind) => () => active && setMenu({ issueId: active.id, kind })

  useShortcuts({
    c: () => setCreating('todo'),
    j: () => setActiveId(moveIssueFocus(activeId, 1)),
    arrowdown: () => setActiveId(moveIssueFocus(activeId, 1)),
    k: () => setActiveId(moveIssueFocus(activeId, -1)),
    arrowup: () => setActiveId(moveIssueFocus(activeId, -1)),
    enter: () => active && void navigate(issuePath(team.slug, workspace.id, active.number)),
    o: () => active && void navigate(issuePath(team.slug, workspace.id, active.number)),
    s: open('status'),
    p: open('priority'),
    a: open('assignee'),
    l: open('label'),
    'shift+c': open('cycle'),
    i: () =>
      active &&
      update.mutate({ issue: active, patch: { assignee_id: active.assignee_id === userId ? null : userId } }),
    escape: () => setActiveId(null),
    '?': () => setHelp(true),
    ...shortcuts,
  })

  return (
    <IssueNavContext.Provider value={{ activeId, setActiveId, menu, setMenu }}>
      {issues.length === 0 ? (
        empty
      ) : view === 'board' ? (
        <IssueBoard issues={issues} onCreate={setCreating} />
      ) : (
        <IssueList issues={issues} onCreate={setCreating} />
      )}
      {/* Keyed so its fields reset to where it was opened from. */}
      <CreateIssueDialog
        key={creating ?? 'closed'}
        open={creating !== null}
        status={creating ?? 'todo'}
        cycleId={cycleId}
        onOpenChange={(next) => !next && setCreating(null)}
      />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </IssueNavContext.Provider>
  )
}
