import { useSuspenseQuery } from '@tanstack/react-query'
import { Columns3, List, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { workspaceIssuesQuery, type IssueStatus } from '@/features/issues/api'
import { CreateIssueDialog } from '@/features/issues/components/CreateIssueDialog'
import { IssueBoard } from '@/features/issues/components/IssueBoard'
import { IssueList } from '@/features/issues/components/IssueList'
import { useCurrentWorkspace } from '@/features/teams/hooks'
import { cn } from '@/lib/utils'

/** Workspace → Issues: List (grouped by status) or Board (?view=board), plus "New issue". */
export function WorkspaceIssuesPage() {
  const { workspace } = useCurrentWorkspace()
  const issues = useSuspenseQuery(workspaceIssuesQuery(workspace.id)).data
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'board' ? 'board' : 'list'
  const [creating, setCreating] = useState<IssueStatus | null>(null)
  const open = issues.filter((i) => i.status !== 'done' && i.status !== 'canceled').length

  const setView = (next: 'list' | 'board') =>
    setParams(
      (p) => {
        if (next === 'board') p.set('view', 'board')
        else p.delete('view')
        return p
      },
      { replace: true },
    )

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold">Issues</h2>
          <span className="font-mono text-xs text-muted-foreground" title="Open issues / all issues">
            {open} open · {issues.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5" role="radiogroup" aria-label="View">
            {(
              [
                { id: 'list', label: 'List', icon: List },
                { id: 'board', label: 'Board', icon: Columns3 },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={view === id}
                onClick={() => setView(id)}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-[5px] px-2 text-xs text-muted-foreground transition-colors hover:text-foreground',
                  view === id && 'bg-muted font-medium text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setCreating('todo')}>
            <Plus /> New issue
          </Button>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="border-y py-12 text-center">
          <p className="text-sm font-medium">No issues yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Track tasks and bugs for {workspace.title}. Everyone in the workspace can create and update issues.
          </p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => setCreating('todo')}>
            <Plus /> Create the first issue
          </Button>
        </div>
      ) : view === 'board' ? (
        <IssueBoard issues={issues} onCreate={setCreating} />
      ) : (
        <IssueList issues={issues} onCreate={setCreating} />
      )}

      {/* Keyed by status so its fields reset to the group it was opened from. */}
      <CreateIssueDialog
        key={creating ?? 'closed'}
        open={creating !== null}
        status={creating ?? 'todo'}
        onOpenChange={(next) => !next && setCreating(null)}
      />
    </>
  )
}
