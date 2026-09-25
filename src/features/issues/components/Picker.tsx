import { Check, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type PickerOption = { value: string; label: string; icon?: ReactNode }

type PickerProps = {
  /** The trigger element (rendered as the popover trigger via asChild). */
  children: ReactNode
  options: PickerOption[]
  selected: string[]
  onSelect: (value: string) => void
  /** Multi-select stays open and shows checkboxes (labels). */
  multi?: boolean
  placeholder: string
  /** Offer "Create “query”" when nothing matches exactly (labels, for managers). */
  onCreate?: (name: string) => void
  align?: 'start' | 'center' | 'end'
  /** Controlled open state (keyboard shortcuts open menus); uncontrolled when omitted. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Linear-style property menu: type to filter, ↑/↓ to move, Enter to pick.
 * Single-select closes on pick; multi-select toggles and stays open.
 */
export function Picker({
  children,
  options,
  selected,
  onSelect,
  multi,
  placeholder,
  onCreate,
  align = 'start',
  open: controlledOpen,
  onOpenChange,
}: PickerProps) {
  const [innerOpen, setInnerOpen] = useState(false)
  const open = controlledOpen ?? innerOpen
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const setOpen = (next: boolean) => {
    if (!next) {
      // Start fresh next time, however it's opened (click or shortcut).
      setQuery('')
      setActive(0)
    }
    if (controlledOpen === undefined) setInnerOpen(next)
    onOpenChange?.(next)
  }

  const q = query.trim().toLowerCase()
  const shown = options.filter((o) => o.label.toLowerCase().includes(q))
  const canCreate = !!onCreate && q !== '' && !options.some((o) => o.label.toLowerCase() === q)
  const count = shown.length + (canCreate ? 1 : 0)

  const choose = (index: number) => {
    if (index < shown.length) {
      onSelect(shown[index].value)
      if (!multi) {
        // Release the search box now: it keeps focus through the close
        // animation, which would swallow a quick next shortcut key.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        setOpen(false)
      }
    } else if (canCreate) {
      onCreate?.(query.trim())
      setQuery('')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-60 p-0"
        // Keep clicks inside a list row from also opening the row's link.
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => (count ? (i + 1) % count : 0))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => (count ? (i - 1 + count) % count : 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (count) choose(active)
            }
          }}
          className="h-9 w-full border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <ul role="listbox" aria-multiselectable={multi} className="max-h-64 overflow-y-auto p-1">
          {shown.map((option, i) => {
            const isSelected = selected.includes(option.value)
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                  i === active && 'bg-muted',
                )}
              >
                {multi && (
                  <span
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border',
                      isSelected && 'border-brand bg-brand text-brand-foreground',
                    )}
                  >
                    {isSelected && <Check className="size-2.5" strokeWidth={3} />}
                  </span>
                )}
                {option.icon}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {!multi && isSelected && <Check className="size-3.5 text-muted-foreground" />}
              </li>
            )
          })}
          {canCreate && (
            <li
              role="option"
              aria-selected={false}
              onMouseEnter={() => setActive(shown.length)}
              onClick={() => choose(shown.length)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                active === shown.length && 'bg-muted',
              )}
            >
              <Plus className="size-3.5 text-muted-foreground" />
              <span className="truncate">Create “{query.trim()}”</span>
            </li>
          )}
          {count === 0 && <li className="px-2 py-3 text-center text-xs text-muted-foreground">No results</li>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
