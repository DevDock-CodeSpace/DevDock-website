import { Check } from 'lucide-react'
import { MODULE_ORDER, workspaceTabDefs } from '@/features/teams/nav'
import { cn } from '@/lib/utils'
import type { WorkspaceModule } from '../api'

/**
 * Toggle list of workspace tools. Overview and Members are always on, so
 * they're shown as fixed rather than selectable.
 */
export function ModulePicker({
  value,
  onChange,
  disabled,
}: {
  value: WorkspaceModule[]
  onChange: (modules: WorkspaceModule[]) => void
  disabled?: boolean
}) {
  const toggle = (module: WorkspaceModule) =>
    onChange(value.includes(module) ? value.filter((m) => m !== module) : [...value, module])

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Tools" className="grid gap-1.5 sm:grid-cols-2">
        {MODULE_ORDER.map((module) => {
          const { title, hint, icon: Icon } = workspaceTabDefs[module]
          const on = value.includes(module)
          return (
            <button
              key={module}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={disabled}
              onClick={() => toggle(module)}
              className={cn(
                'flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-60',
                on ? 'border-brand/50 bg-brand/5' : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              <Icon className={cn('size-4 shrink-0', on && 'text-brand')} />
              <span className="min-w-0 flex-1">
                <span className={cn('block leading-tight', on && 'font-medium text-foreground')}>{title}</span>
                <span className="block truncate text-xs text-muted-foreground">{hint}</span>
              </span>
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                  on ? 'border-brand bg-brand text-brand-foreground' : 'border-input',
                )}
              >
                {on && <Check className="size-3" />}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">Overview and Members are always included.</p>
    </div>
  )
}
