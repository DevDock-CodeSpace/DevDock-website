import { Lock, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileAccess } from '../sharing'

/**
 * "Who can open it" when making a doc, whiteboard or folder: everyone in its place (the default, as
 * before) or only its maker and the people they add (Restricted). Group owners/admins always can.
 */
export function AccessChoice({
  value,
  onChange,
  placeName,
}: {
  value: FileAccess
  onChange: (access: FileAccess) => void
  /** "the group", or the workspace's title. */
  placeName: string
}) {
  const options: { value: FileAccess; icon: typeof Users; title: string; hint: string }[] = [
    { value: 'place', icon: Users, title: `Everyone in ${placeName}`, hint: 'Anyone who can open it there.' },
    { value: 'restricted', icon: Lock, title: 'Only me and people I add', hint: 'Hidden from everyone else. Share it later.' },
  ]
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">Who can open it</legend>
      <div role="radiogroup" className="grid gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors',
              value === option.value ? 'border-brand bg-brand/5' : 'hover:bg-muted/50',
            )}
          >
            <option.icon className={cn('mt-0.5 size-4 shrink-0', value === option.value ? 'text-brand' : 'text-muted-foreground')} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{option.title}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Group owners and admins can always open it.</p>
    </fieldset>
  )
}
