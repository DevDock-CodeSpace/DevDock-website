import { cn } from '@/lib/utils'
import type { PlanStatus } from '../api'
import { planStatusDot, planStatusLabel } from '../meta'

/** A small round marker for a plan's status, used in pickers, chips and lists. */
export function PlanStatusDot({ status, className }: { status: PlanStatus; className?: string }) {
  return <span role="img" aria-label={planStatusLabel[status]} className={cn('inline-block size-2.5 shrink-0 rounded-full', planStatusDot[status], className)} />
}
