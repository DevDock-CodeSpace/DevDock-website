import { cn } from '@/lib/utils'

/** "12 / 30" with a thin bar, as on Linear's project rows. */
export function PlanProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const percent = total ? Math.round((done / total) * 100) : 0
  return (
    <div className={cn('flex items-center gap-2', className)} title={total ? `${done} of ${total} done (${percent}%)` : 'No issues yet'}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  )
}
