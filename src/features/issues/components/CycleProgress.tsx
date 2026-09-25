import { cn } from '@/lib/utils'

/** Thin completion bar with "done/scope · %". */
export function CycleProgress({
  completed,
  scope,
  percent,
  className,
}: {
  completed: number
  scope: number
  percent: number
  className?: string
}) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full bg-brand" style={{ width: `${percent}%` }} />
      </span>
      <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground" title={`${completed} of ${scope} done`}>
        {completed}/{scope} · {percent}%
      </span>
    </span>
  )
}
