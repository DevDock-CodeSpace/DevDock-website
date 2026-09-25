import { cn } from '@/lib/utils'
import type { IssueLabel } from '../api'
import { labelDotClass } from '../meta'

/** Linear's label pill: hairline border, colored dot, name. */
export function LabelChip({ label, className }: { label: IssueLabel; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-36 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] text-muted-foreground',
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', labelDotClass[label.color])} />
      <span className="truncate">{label.name}</span>
    </span>
  )
}
