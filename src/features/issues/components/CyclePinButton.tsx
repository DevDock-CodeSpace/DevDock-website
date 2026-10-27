import { Check, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useCurrentTeam } from '@/features/teams/hooks'
import type { IssueCycle } from '../api'
import { cycleTitle } from '../cycles'
import { usePins } from '../viewsHooks'

/**
 * Stars a sprint (cycle), so it's in your sidebar's Starred list. The one running now can also be
 * starred as "Current sprint", which keeps pointing at whichever sprint is current when the next starts.
 */
export function CyclePinButton({ cycle, current }: { cycle: IssueCycle; current: boolean }) {
  const { team } = useCurrentTeam()
  const { find, pin, remove } = usePins(team.id)
  const busy = pin.isPending || remove.isPending
  const specific = find(cycle.workspace_id, { kind: 'cycle', cycleId: cycle.id })
  const running = find(cycle.workspace_id, { kind: 'current_cycle' })
  const toggle = (existing: { id: string } | null, target: Parameters<typeof pin.mutate>[0]['target']) => {
    if (existing) remove.mutate(existing.id)
    else pin.mutate({ workspaceId: cycle.workspace_id, target })
  }
  const pinned = specific !== null || (current && running !== null)

  if (!current) {
    const label = specific ? 'Unstar' : 'Star'
    return (
      <Button variant="ghost" size="icon-sm" className={pinned ? undefined : 'text-muted-foreground'} aria-label={label} aria-pressed={pinned} title={label} disabled={busy} onClick={() => toggle(specific, { kind: 'cycle', cycleId: cycle.id })}>
        <Star className={pinned ? 'fill-amber-400 text-amber-400' : undefined} />
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={pinned ? undefined : 'text-muted-foreground'} aria-label="Star options" aria-pressed={pinned} title="Star" disabled={busy}>
          <Star className={pinned ? 'fill-amber-400 text-amber-400' : undefined} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onSelect={() => toggle(running, { kind: 'current_cycle' })}>
          <span className="flex-1">{running ? 'Unstar' : 'Star'} “Current sprint”</span>
          {running && <Check className="size-4 text-brand" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toggle(specific, { kind: 'cycle', cycleId: cycle.id })}>
          <span className="flex-1">{specific ? 'Unstar' : 'Star'} {cycleTitle(cycle)}</span>
          {specific && <Check className="size-4 text-brand" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
