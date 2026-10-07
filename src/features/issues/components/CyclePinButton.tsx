import { Check, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useCurrentTeam } from '@/features/teams/hooks'
import type { IssueCycle } from '../api'
import { cycleTitle } from '../cycles'
import { usePins } from '../viewsHooks'

/**
 * Pins a cycle to your sidebar. The cycle that is running now can also be pinned as "Current cycle",
 * which keeps pointing at whichever cycle is current when the next one starts.
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
    const label = specific ? 'Unpin from sidebar' : 'Pin to sidebar'
    return (
      <Button variant="ghost" size="icon-sm" className={pinned ? 'text-brand' : 'text-muted-foreground'} aria-label={label} aria-pressed={pinned} title={label} disabled={busy} onClick={() => toggle(specific, { kind: 'cycle', cycleId: cycle.id })}>
        <Pin className={pinned ? 'fill-current' : undefined} />
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={pinned ? 'text-brand' : 'text-muted-foreground'} aria-label="Pin options" aria-pressed={pinned} title="Pin to sidebar" disabled={busy}>
          <Pin className={pinned ? 'fill-current' : undefined} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onSelect={() => toggle(running, { kind: 'current_cycle' })}>
          <span className="flex-1">{running ? 'Unpin' : 'Pin'} “Current sprint”</span>
          {running && <Check className="size-4 text-brand" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toggle(specific, { kind: 'cycle', cycleId: cycle.id })}>
          <span className="flex-1">{specific ? 'Unpin' : 'Pin'} {cycleTitle(cycle)}</span>
          {specific && <Check className="size-4 text-brand" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
