import { Search } from 'lucide-react'
import { useState, type DragEvent, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ICON_GROUPS, ICON_KEYS, ICONS } from './icons'
import { SHAPE_KINDS, shapeLabels, type LibraryItem } from './model'
import { ShapeSvg } from './ShapeSvg'

/** dataTransfer type for dragging a library item onto the canvas. */
export const LIBRARY_DRAG_TYPE = 'application/x-devdock-diagram-item'

const containers = [
  { variant: 'solid', label: 'Group' },
  { variant: 'dashed', label: 'Zone' },
] as const

/** Left panel: searchable shapes, containers and architecture icons. Click to add, or drag onto the canvas. */
export function ShapePanel({ onAdd }: { onAdd: (item: LibraryItem) => void }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = (...words: string[]) => !q || words.some((w) => w.toLowerCase().includes(q))

  const shapes = SHAPE_KINDS.filter((kind) => matches(shapeLabels[kind], kind))
  const groups = containers.filter((c) => matches(c.label, 'container'))
  const iconGroups = ICON_GROUPS.map((group) => ({
    group,
    keys: ICON_KEYS.filter((key) => ICONS[key].group === group && matches(ICONS[key].label, key, group)),
  })).filter((g) => g.keys.length > 0)
  const empty = shapes.length === 0 && groups.length === 0 && iconGroups.length === 0

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-background md:flex" aria-label="Shapes">
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shapes"
            aria-label="Search shapes"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-2 pb-6">
        {shapes.length > 0 && (
          <Section title="Shapes">
            {shapes.map((shape) => (
              <Tile key={shape} label={shapeLabels[shape]} item={{ type: 'shape', shape }} onAdd={onAdd}>
                <div className="relative h-6 w-9">
                  <ShapeSvg
                    shape={shape}
                    width={36}
                    height={24}
                    strokeWidth={1.25}
                    className={cn(
                      'fill-card stroke-foreground/60',
                      shape === 'text' && 'fill-transparent stroke-transparent',
                      shape === 'note' && 'fill-amber-50 stroke-amber-500 dark:fill-amber-950',
                    )}
                    detailClassName={shape === 'note' ? 'stroke-amber-500' : 'stroke-foreground/60'}
                  />
                  {shape === 'text' && (
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">T</span>
                  )}
                </div>
              </Tile>
            ))}
          </Section>
        )}
        {groups.length > 0 && (
          <Section title="Containers">
            {groups.map(({ variant, label }) => (
              <Tile key={variant} label={label} item={{ type: 'container', variant }} onAdd={onAdd}>
                <div
                  className={cn(
                    'h-6 w-9 rounded-[4px] border-[1.25px] border-foreground/60',
                    variant === 'solid' ? 'bg-muted' : 'border-dashed',
                  )}
                />
              </Tile>
            ))}
          </Section>
        )}
        {iconGroups.map(({ group, keys }) => (
          <Section key={group} title={group}>
            {keys.map((key) => {
              const { icon: Icon, label } = ICONS[key]
              return (
                <Tile key={key} label={label} item={{ type: 'icon', icon: key }} onAdd={onAdd}>
                  <Icon className="size-5 text-foreground/80" strokeWidth={1.5} />
                </Tile>
              )
            })}
          </Section>
        ))}
        {empty && <p className="px-1 py-6 text-center text-xs text-muted-foreground">No shapes match “{query}”.</p>}
      </div>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 px-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="grid grid-cols-3 gap-0.5">{children}</div>
    </section>
  )
}

function Tile({
  label,
  item,
  onAdd,
  children,
}: {
  label: string
  item: LibraryItem
  onAdd: (item: LibraryItem) => void
  children: ReactNode
}) {
  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData(LIBRARY_DRAG_TYPE, JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'copy'
  }
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={() => onAdd(item)}
      title={`${label}: click to add, or drag onto the canvas`}
      className="flex h-16 cursor-grab flex-col items-center justify-center gap-1.5 rounded-md px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none active:cursor-grabbing"
    >
      <span className="flex h-6 items-center justify-center">{children}</span>
      <span className="w-full truncate text-center text-[10px] leading-none">{label}</span>
    </button>
  )
}
