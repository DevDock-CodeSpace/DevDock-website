import { Check, ChevronDown, Copy, Layers, Link2, MoreHorizontal, Pencil, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuesPath } from '@/features/teams/nav'
import { cn } from '@/lib/utils'
import { useIssueContext } from '../hooks'
import { viewHref } from '../views'
import type { IssueView } from '../viewsApi'
import { useActiveView, useViewMutations } from '../viewsHooks'
import { ViewDialog } from './ViewDialog'

/** "Views ▾": your saved views and the ones shared with the workspace. */
export function ViewsMenu() {
  const { team } = useCurrentTeam()
  const { workspace, userId } = useIssueContext()
  const { views, view: open } = useActiveView()
  const base = issuesPath(team.slug, workspace.id)
  const mine = views.filter((view) => view.owner_id === userId)
  const shared = views.filter((view) => view.owner_id !== userId)

  const row = (view: IssueView) => (
    <DropdownMenuItem key={view.id} asChild>
      <Link to={viewHref(base, view)} className={cn(open?.id === view.id && 'font-medium')}>
        <span className="min-w-0 flex-1 truncate">{view.name}</span>
        {view.shared && <Users className="size-3.5 text-muted-foreground" aria-label="Shared" />}
        {open?.id === view.id && <Check className="size-3.5 text-brand" />}
      </Link>
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="h-7 gap-1.5 px-2.5 text-muted-foreground">
          <Layers className="size-3.5" /> Views
          {views.length > 0 && <span className="font-mono text-[10px] opacity-70">{views.length}</span>}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-96 w-64 overflow-y-auto">
        {views.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No saved views yet. Filter the list, then choose “Save view”.</p>
        )}
        {mine.length > 0 && <DropdownMenuLabel className="text-xs text-muted-foreground">Your views</DropdownMenuLabel>}
        {mine.map(row)}
        {mine.length > 0 && shared.length > 0 && <DropdownMenuSeparator />}
        {shared.length > 0 && <DropdownMenuLabel className="text-xs text-muted-foreground">Shared with {workspace.title}</DropdownMenuLabel>}
        {shared.map(row)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The open view as a tab, with edit / duplicate / copy link / delete. */
export function OpenViewTab() {
  const { team } = useCurrentTeam()
  const { workspace, userId, canManage } = useIssueContext()
  const { view, state } = useActiveView()
  const { create, update, remove } = useViewMutations()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'edit' | 'duplicate' | null>(null)
  const [confirming, setConfirming] = useState(false)
  if (!view) return null
  const base = issuesPath(team.slug, workspace.id)
  const owner = view.owner_id === userId
  const canEdit = owner || (view.shared && canManage)

  return (
    <>
      <span className="inline-flex h-7 items-center gap-1 rounded-md bg-muted pr-0.5 pl-2.5 text-xs font-medium">
        <Layers className="size-3.5 text-brand" />
        <span className="max-w-40 truncate">{view.name}</span>
        {view.shared && <Users className="size-3 text-muted-foreground" aria-label="Shared" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="size-6" aria-label="View options"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {canEdit && <DropdownMenuItem onSelect={() => setDialog('edit')}><Pencil /> Edit…</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => setDialog('duplicate')}><Copy /> Duplicate…</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                navigator.clipboard.writeText(`${window.location.origin}${viewHref(base, view)}`).then(
                  () => toast.success(view.shared ? 'Link copied' : 'Link copied (only you can open it until you share the view)'),
                  () => toast.error('Could not copy the link.'),
                )
              }}
            >
              <Link2 /> Copy link
            </DropdownMenuItem>
            {canEdit && <DropdownMenuSeparator />}
            {canEdit && <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}><Trash2 /> Delete…</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>

      {dialog === 'edit' && (
        <ViewDialog
          open
          onOpenChange={(next) => !next && setDialog(null)}
          mode="edit"
          workspaceTitle={workspace.title}
          initial={{ name: view.name, shared: view.shared }}
          canShare={owner}
          pending={update.isPending}
          onSubmit={(name, shared) => update.mutate({ id: view.id, patch: { name, ...(owner ? { shared } : {}) } }, { onSuccess: () => setDialog(null) })}
        />
      )}
      {dialog === 'duplicate' && (
        <ViewDialog
          open
          onOpenChange={(next) => !next && setDialog(null)}
          mode="create"
          workspaceTitle={workspace.title}
          initial={{ name: `${view.name} copy`.slice(0, 60), shared: false }}
          pending={create.isPending}
          onSubmit={(name, shared) =>
            create.mutate(
              { workspaceId: workspace.id, name, shared, state },
              { onSuccess: (created) => { setDialog(null); navigate(viewHref(base, created)) } },
            )
          }
        />
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete “${view.name}”?`}
        description={view.shared ? `Everyone in ${workspace.title} loses this view, and it's unpinned from their sidebars. The issues aren't affected.` : 'The issues aren’t affected, and it will be unpinned from your sidebar.'}
        confirmLabel="Delete view"
        pending={remove.isPending}
        onConfirm={() => remove.mutate(view, { onSuccess: () => { setConfirming(false); navigate(base, { replace: true }) } })}
      />
    </>
  )
}
