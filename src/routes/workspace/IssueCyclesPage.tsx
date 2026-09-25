import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { IterationCw, MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteCycle, issueKeys, workspaceIssuesQuery, type IssueCycle } from '@/features/issues/api'
import { CycleDialog } from '@/features/issues/components/CycleDialog'
import { CycleProgress } from '@/features/issues/components/CycleProgress'
import { IssuesNav } from '@/features/issues/components/IssuesNav'
import { cycleProgress, cycleState, cycleTitle, cycleWhen, type CycleState } from '@/features/issues/cycles'
import { useIssueContext } from '@/features/issues/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { cyclePath } from '@/features/teams/nav'
import { errorMessage } from '@/lib/errors'
import { formatShortDate, localDateISO } from '@/lib/format'
import { cn } from '@/lib/utils'

const SECTIONS: { state: CycleState; title: string }[] = [
  { state: 'current', title: 'Current' },
  { state: 'upcoming', title: 'Upcoming' },
  { state: 'past', title: 'Past' },
]

/** Issues → Cycles: current, upcoming and past cycles with progress. Managers create, edit and delete. */
export function IssueCyclesPage() {
  const { workspace, cycles, canManage } = useIssueContext()
  const issues = useSuspenseQuery(workspaceIssuesQuery(workspace.id)).data
  const [today] = useState(() => localDateISO(new Date()))
  const [creating, setCreating] = useState(false)

  return (
    <>
      <IssuesNav
        actions={
          canManage && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> New cycle
            </Button>
          )
        }
      />
      {cycles.length === 0 ? (
        <div className="border-y py-12 text-center">
          <IterationCw className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No cycles yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Cycles are time-boxed sprints, usually 1–2 weeks. Plan which issues get done in each one and track progress.
            {!canManage && ' The workspace lead can create them.'}
          </p>
          {canManage && (
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setCreating(true)}>
              <Plus /> Create the first cycle
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {SECTIONS.map(({ state, title }) => {
            const inSection = cycles.filter((c) => cycleState(c, today) === state)
            if (inSection.length === 0) return null
            // Past cycles newest first; the others in date order.
            const ordered = state === 'past' ? [...inSection].reverse() : inSection
            return (
              <section key={state} aria-label={title}>
                <h2 className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">{title}</h2>
                <ul className="divide-y border-y">
                  {ordered.map((cycle) => (
                    <CycleRow
                      key={cycle.id}
                      cycle={cycle}
                      state={state}
                      today={today}
                      progress={cycleProgress(issues.filter((i) => i.cycle_id === cycle.id))}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      <CycleDialog key={creating ? 'open' : 'closed'} open={creating} onOpenChange={setCreating} />
    </>
  )
}

function CycleRow({
  cycle,
  state,
  today,
  progress,
}: {
  cycle: IssueCycle
  state: CycleState
  today: string
  progress: ReturnType<typeof cycleProgress>
}) {
  const { team } = useCurrentTeam()
  const { workspace, canManage } = useIssueContext()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const when = cycleWhen(cycle, today, formatShortDate)

  const remove = async () => {
    setDeleting(true)
    try {
      await deleteCycle(cycle.id)
      toast.success(`${cycleTitle(cycle)} was deleted`)
      await queryClient.invalidateQueries({ queryKey: issueKeys.all })
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <li className="relative flex h-12 items-center gap-3 px-3 text-sm hover:bg-muted/50">
      <IterationCw className={cn('size-4 shrink-0', state === 'current' ? 'text-brand' : 'text-muted-foreground')} />
      <Link
        to={cyclePath(team.slug, workspace.id, cycle.number)}
        className="min-w-0 truncate font-medium outline-none after:absolute after:inset-0"
      >
        {cycleTitle(cycle)}
      </Link>
      <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
        {formatShortDate(cycle.starts_on)} – {formatShortDate(cycle.ends_on)}
      </span>
      <span className="flex-1" />
      <span className={cn('hidden text-xs md:inline', state === 'current' ? 'text-brand' : 'text-muted-foreground')}>
        {when}
      </span>
      <CycleProgress {...progress} className="w-44 shrink-0 justify-end" />
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative z-10 text-muted-foreground" aria-label={`${cycleTitle(cycle)} actions`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <CycleDialog key={editing ? 'open' : 'closed'} open={editing} onOpenChange={setEditing} cycle={cycle} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${cycleTitle(cycle)}?`}
        description="Its issues are kept; they just won’t be in a cycle anymore."
        confirmLabel="Delete cycle"
        pending={deleting}
        onConfirm={() => void remove()}
      />
    </li>
  )
}
