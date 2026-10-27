import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentTeam } from '@/features/teams/hooks'
import { cn } from '@/lib/utils'
import type { StarTarget } from '../viewsApi'
import { usePins } from '../viewsHooks'

/** The ☆ that adds an issue, a plan or My issues to the sidebar's Starred list (and takes it off again). */
export function StarButton({ target, label }: { target: StarTarget; label: string }) {
  const { team } = useCurrentTeam()
  const { star, findStar, remove } = usePins(team.id)
  const existing = findStar(target)
  const text = existing ? `Unstar ${label}` : `Star ${label}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={text}
          aria-pressed={existing !== null}
          onClick={() => (existing ? remove.mutate(existing.id) : star(target))}
        >
          <Star className={cn(existing && 'fill-amber-400 text-amber-400')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{existing ? 'Unstar' : 'Star'}</TooltipContent>
    </Tooltip>
  )
}
