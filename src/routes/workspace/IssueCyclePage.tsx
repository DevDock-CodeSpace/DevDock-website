import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, IterationCw, MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteCycle, issueKeys, moveOpenIssues, workspaceIssuesQuery, type IssueStatus } from '@/features/issues/api'
import { CycleDialog } from '@/features/issues/components/CycleDialog'
import { CycleProgress } from '@/features/issues/components/CycleProgress'
import { IssueCollection } from '@/features/issues/components/IssueCollection'
import { IssueFilterBar } from '@/features/issues/components/IssueFilterBar'
import { IssuesNav } from '@/features/issues/components/IssuesNav'
import { ViewToggle } from '@/features/issues/components/ViewToggle'
import { cycleProgress, cycleState, cycleTitle, cycleWhen, nextCycle } from '@/features/issues/cycles'
import { applyFilters } from '@/features/issues/filters'
import { useIssueContext, useIssueFilters, useIssueView } from '@/features/issues/hooks'
import { isClosed } from '@/features/issues/meta'
import { useCurrentTeam } from '@/features/teams/hooks'
import { cyclePath, cyclesPath } from '@/features/teams/nav'
import { errorMessage } from '@/lib/errors'
import { formatDate, localDateISO } from '@/lib/format'
import { cn } from '@/lib/utils'

/** One cycle: dates, progress (scope / started / completed), its issues, and manager actions. */
export function IssueCyclePage() {
  const { cycleNumber } = useParams()
  const { team } = useCurrentTeam()
  const { workspace, cycles, canManage, userId } = useIssueContext()
  const all = useSuspenseQuery(workspaceIssuesQuery(workspace.id)).data
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [filters, setFilters] = useIssueFilters()
  const [view, setView] = useIssueView()
  const [today] = useState(() => localDateISO(new Date()))
  const [creating, setCreating] = useState<IssueStatus | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const cycle = cycles.find((c) => c.number === Number(cycleNumber))
  if (!cycle) {
    return <p className="py-16 text-center text-sm text-muted-foreground">This cycle doesn’t exist anymore.</p>
  }

  const inCycle = all.filter((i) => i.cycle_id === cycle.id)
  const issues = applyFilters(inCycle, 'all', { ...filters, cycle: [] }, { userId, currentCycleId: undefined })
  const progress = cycleProgress(inCycle)
  const state = cycleState(cycle, today)
  const next = nextCycle(cycles, cycle)
  const openCount = inCycle.filter((i) => !isClosed(i.status)).length
  const index = cycles.indexOf(cycle)
  const previous = cycles[index - 1]
  const following = cycles[index + 1]

  const move = async (to: string | null) => {
    setBusy(true)
    try {
      const moved = await moveOpenIssues(cycle.id, to)
      const target = cycles.find((c) => c.id === to)
      toast.success(`${moved} ${moved === 1 ? 'issue' : 'issues'} moved ${target ? `to ${cycleTitle(target)}` : 'out of cycles'}`)
      await queryClient.invalidateQueries({ queryKey: issueKeys.all })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteCycle(cycle.id)
      toast.success(`${cycleTitle(cycle)} was deleted`)
      // Leave the page before dropping its data (see useExitTeam for why).
      await navigate(cyclesPath(team.slug, workspace.id), { replace: true })
      await queryClient.invalidateQueries({ queryKey: issueKeys.all })
    } catch (error) {
      toast.error(errorMessage(error))
      setBusy(false)
    }
  }

  const when = cycleWhen(cycle, today, formatDate)

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

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to={cyclesPath(team.slug, workspace.id)} className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Cycles
            </Link>
            <span aria-hidden>·</span>
            <span className={cn(state === 'current' && 'font-medium text-brand')}>{when}</span>
          </div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <IterationCw className={cn('size-5', state === 'current' ? 'text-brand' : 'text-muted-foreground')} />
            {cycleTitle(cycle)}
          </h2>
          <p className="font-mono text-xs text-muted-foreground">
            {formatDate(cycle.starts_on)} – {formatDate(cycle.ends_on)}
          </p>
        </div>
        <div className="flex items-center gap-5">
          <dl className="flex gap-5 text-sm">
            {[
              ['Scope', progress.scope],
              ['Started', progress.started],
              ['Completed', progress.completed],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-mono text-base">{value}</dd>
              </div>
            ))}
          </dl>
          <CycleProgress {...progress} />
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous cycle"
              disabled={!previous}
              onClick={() => previous && void navigate(cyclePath(team.slug, workspace.id, previous.number))}
            >
              <ArrowLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next cycle"
              disabled={!following}
              onClick={() => following && void navigate(cyclePath(team.slug, workspace.id, following.number))}
            >
              <ArrowRight />
            </Button>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Cycle actions" disabled={busy}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {next && (
                    <DropdownMenuItem disabled={openCount === 0} onSelect={() => void move(next.id)}>
                      Move {openCount} open {openCount === 1 ? 'issue' : 'issues'} to {cycleTitle(next)}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem disabled={openCount === 0} onSelect={() => void move(null)}>
                    Remove {openCount} open {openCount === 1 ? 'issue' : 'issues'} from the cycle
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setEditing(true)}>Edit cycle</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    Delete cycle
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <div className="mb-3">
        <IssueFilterBar
          filters={filters}
          onChange={setFilters}
          open={filterOpen}
          onOpenChange={setFilterOpen}
          hideFacets={['cycle']}
        />
      </div>
      <IssueCollection
        issues={issues}
        view={view}
        cycleId={cycle.id}
        creating={creating}
        onCreatingChange={setCreating}
        shortcuts={{ f: () => setFilterOpen(true) }}
        empty={
          <div className="border-y py-12 text-center text-sm text-muted-foreground">
            {inCycle.length === 0
              ? 'No issues in this cycle yet. Create one here, or set the Cycle on existing issues (⇧C).'
              : 'No issues match these filters.'}
          </div>
        }
      />

      <CycleDialog key={editing ? 'open' : 'closed'} open={editing} onOpenChange={setEditing} cycle={cycle} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${cycleTitle(cycle)}?`}
        description="Its issues are kept; they just won’t be in a cycle anymore."
        confirmLabel="Delete cycle"
        pending={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}
