import { Columns3, List } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ViewToggle({ view, onChange }: { view: 'list' | 'board'; onChange: (view: 'list' | 'board') => void }) {
  return (
    <div className="flex rounded-md border p-0.5" role="radiogroup" aria-label="View">
      {(
        [
          { id: 'list', label: 'List', icon: List },
          { id: 'board', label: 'Board', icon: Columns3 },
        ] as const
      ).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={view === id}
          onClick={() => onChange(id)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-[5px] px-2 text-xs text-muted-foreground transition-colors hover:text-foreground',
            view === id && 'bg-muted font-medium text-foreground',
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  )
}
