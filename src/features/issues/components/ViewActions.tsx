import { RotateCcw, Save } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuesPath } from '@/features/teams/nav'
import { hasFilters } from '../filters'
import { useIssueContext } from '../hooks'
import { viewHref } from '../views'
import { useActiveView, useViewMutations } from '../viewsHooks'
import { ViewDialog } from './ViewDialog'

/**
 * Next to the filters: "Save view" when you've filtered something, and for an open view that you've
 * changed: Reset, Save as new, and Save changes (owners, and leads for shared views).
 */
export function ViewActions() {
  const { team } = useCurrentTeam()
  const { workspace, userId, canManage } = useIssueContext()
  const { view, state, modified } = useActiveView()
  const { create, update } = useViewMutations()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState(false)
  const base = issuesPath(team.slug, workspace.id)

  const worthSaving = hasFilters(state.filters) || state.tab !== 'all'
  const canEdit = view !== null && (view.owner_id === userId || (view.shared && canManage))

  const saveNew = (name: string, shared: boolean) =>
    create.mutate(
      { workspaceId: workspace.id, name, shared, state },
      {
        onSuccess: (created) => {
          setDialog(false)
          navigate(viewHref(base, created), { replace: true })
        },
      },
    )

  if (view === null) {
    if (!worthSaving) return null
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setDialog(true)}>
          <Save /> Save view
        </Button>
        {dialog && <ViewDialog open onOpenChange={setDialog} mode="create" workspaceTitle={workspace.title} pending={create.isPending} onSubmit={saveNew} />}
      </>
    )
  }

  if (!modified) return null
  return (
    <>
      <span className="text-xs text-muted-foreground">Modified</span>
      <Button variant="ghost" size="sm" onClick={() => navigate(viewHref(base, view), { replace: true })}>
        <RotateCcw /> Reset
      </Button>
      <Button variant="outline" size="sm" onClick={() => setDialog(true)}>Save as new</Button>
      {canEdit && (
        <Button size="sm" disabled={update.isPending} onClick={() => update.mutate({ id: view.id, patch: { state } })}>
          Save changes
        </Button>
      )}
      {dialog && <ViewDialog open onOpenChange={setDialog} mode="create" workspaceTitle={workspace.title} pending={create.isPending} onSubmit={saveNew} />}
    </>
  )
}
