import { cn } from '@/lib/utils'

/** A small segmented control (Open · Done · All) for the Issues hub's toolbars. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => value !== o.id && onChange(o.id)}
          className={cn(
            'h-6 rounded-md px-3 text-xs transition-colors',
            value === o.id ? 'bg-background font-medium text-foreground shadow-sm dark:bg-muted' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
