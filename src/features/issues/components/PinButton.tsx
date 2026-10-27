import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrentTeam } from '@/features/teams/hooks'
import { FACETS } from '../filters'
import { useIssueContext } from '../hooks'
import { personOf } from '../views'
import type { PinTarget } from '../viewsApi'
import { useActiveView, usePins } from '../viewsHooks'

/**
 * Stars what's on screen, so it's in your sidebar's Starred list: a saved view, one person's issues,
 * or a built-in tab. Unsaved filters can't be starred (save them as a view first).
 */
export function PinButton() {
  const { team } = useCurrentTeam()
  const { workspace } = useIssueContext()
  const { view, state } = useActiveView()
  const { find, pin, remove } = usePins(team.id)

  const person = personOf(state)
  const plainTab = FACETS.every((facet) => state.filters[facet].length === 0)
  const target: PinTarget | null = view
    ? { kind: 'view', viewId: view.id }
    : person
      ? { kind: 'person', personId: person }
      : plainTab
        ? { kind: 'tab', tab: state.tab }
        : null

  const existing = target ? find(workspace.id, target) : null
  const label = !target ? 'Save this view to star it' : existing ? 'Unstar' : 'Star'
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={existing ? undefined : 'text-muted-foreground'}
      aria-label={label}
      aria-pressed={existing !== null}
      title={label}
      disabled={!target || pin.isPending || remove.isPending}
      onClick={() => {
        if (!target) return
        if (existing) remove.mutate(existing.id)
        else pin.mutate({ workspaceId: workspace.id, target })
      }}
    >
      <Star className={existing ? 'fill-amber-400 text-amber-400' : undefined} />
    </Button>
  )
}
