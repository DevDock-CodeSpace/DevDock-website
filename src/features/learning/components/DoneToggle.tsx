import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The round "done" checkbox on a lesson row. */
export function DoneToggle({
  done,
  onToggle,
  label,
  className,
}: {
  done: boolean
  onToggle: () => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
        done ? 'border-brand bg-brand text-brand-foreground' : 'border-muted-foreground/50 hover:border-brand',
        className,
      )}
    >
      {done && <Check className="size-3" strokeWidth={3} />}
    </button>
  )
}
