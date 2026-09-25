import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Bold,
  BringToFront,
  Copy,
  SendToBack,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { bgClass, borderClass, COLOR_KEYS, colorNames, FILL_KEYS, swatchClass } from './colors'
import type { ColorKey, ConnectorData, DiagramEdge, DiagramNode, DiagramNodeData, FillKey } from './model'

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

type PropertiesPanelProps = {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  onNodes: (patch: Partial<DiagramNodeData>) => void
  onEdges: (patch: Partial<ConnectorData>) => void
  onAlign: (alignment: Alignment) => void
  onDistribute: (axis: 'x' | 'y') => void
  onArrange: (to: 'front' | 'back') => void
  onDuplicate: () => void
  onDelete: () => void
  snapToGrid: boolean
  onSnapToGrid: (on: boolean) => void
}

/** Right panel: style for the selection (Lucid's "shape/line options"), or canvas settings when nothing is selected. */
export function PropertiesPanel(props: PropertiesPanelProps) {
  const { nodes, edges } = props
  const nothing = nodes.length === 0 && edges.length === 0

  return (
    <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-l bg-background lg:flex" aria-label="Properties">
      {nothing && <CanvasOptions {...props} />}
      {nodes.length > 0 && <NodeOptions {...props} />}
      {edges.length > 0 && <EdgeOptions {...props} />}
      {!nothing && (
        <Group title="Arrange">
          <div className="grid grid-cols-2 gap-1">
            {nodes.length > 0 && (
              <>
                <ActionButton icon={BringToFront} label="To front" onClick={() => props.onArrange('front')} />
                <ActionButton icon={SendToBack} label="To back" onClick={() => props.onArrange('back')} />
                <ActionButton icon={Copy} label="Duplicate" onClick={props.onDuplicate} />
              </>
            )}
            <ActionButton icon={Trash2} label="Delete" onClick={props.onDelete} destructive />
          </div>
        </Group>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------- sections

function NodeOptions({ nodes, onNodes, onAlign, onDistribute }: PropertiesPanelProps) {
  const same = <K extends keyof DiagramNodeData>(key: K) => {
    const first = nodes[0].data[key]
    return nodes.every((n) => n.data[key] === first) ? first : undefined
  }
  const allIcons = nodes.every((n) => n.type === 'icon')
  const single = nodes.length === 1 ? nodes[0] : null

  return (
    <>
      <Group title={nodes.length === 1 ? kindTitle(nodes[0]) : `${nodes.length} shapes`}>
        {single && (
          <TextField
            key={single.id}
            value={single.data.label}
            placeholder="Text"
            onCommit={(label) => onNodes({ label })}
          />
        )}
      </Group>
      <Group title="Fill">
        <Swatches<FillKey> keys={FILL_KEYS} value={same('fill')} onChange={(fill) => onNodes({ fill })} kind="fill" />
      </Group>
      <Group title={allIcons ? 'Icon & border color' : 'Border'}>
        <Swatches<ColorKey> keys={COLOR_KEYS} value={same('stroke')} onChange={(stroke) => onNodes({ stroke })} kind="line" />
        <Segmented
          value={same('line')}
          onChange={(line) => onNodes({ line })}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'none', label: 'None' },
          ]}
        />
      </Group>
      <Group title="Text">
        <div className="flex gap-1">
          <Segmented
            className="flex-1"
            value={same('text')}
            onChange={(text) => onNodes({ text })}
            options={[
              { value: 'sm', label: 'S' },
              { value: 'md', label: 'M' },
              { value: 'lg', label: 'L' },
            ]}
          />
          <Button
            variant={same('bold') ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Bold"
            aria-pressed={same('bold') === true}
            onClick={() => onNodes({ bold: same('bold') !== true })}
          >
            <Bold />
          </Button>
        </div>
      </Group>
      {nodes.length > 1 && (
        <Group title="Align">
          <div className="flex flex-wrap gap-0.5">
            <IconButton icon={AlignStartVertical} label="Align left" onClick={() => onAlign('left')} />
            <IconButton icon={AlignCenterVertical} label="Align centers horizontally" onClick={() => onAlign('center')} />
            <IconButton icon={AlignEndVertical} label="Align right" onClick={() => onAlign('right')} />
            <IconButton icon={AlignStartHorizontal} label="Align top" onClick={() => onAlign('top')} />
            <IconButton icon={AlignCenterHorizontal} label="Align middles vertically" onClick={() => onAlign('middle')} />
            <IconButton icon={AlignEndHorizontal} label="Align bottom" onClick={() => onAlign('bottom')} />
            {nodes.length > 2 && (
              <>
                <IconButton icon={AlignHorizontalDistributeCenter} label="Distribute horizontally" onClick={() => onDistribute('x')} />
                <IconButton icon={AlignVerticalDistributeCenter} label="Distribute vertically" onClick={() => onDistribute('y')} />
              </>
            )}
          </div>
        </Group>
      )}
    </>
  )
}

function EdgeOptions({ edges, onEdges }: PropertiesPanelProps) {
  const same = <K extends keyof ConnectorData>(key: K) => {
    const first = edges[0].data?.[key]
    return edges.every((e) => e.data?.[key] === first) ? first : undefined
  }
  const single = edges.length === 1 ? edges[0] : null

  return (
    <>
      <Group title={edges.length === 1 ? 'Connector' : `${edges.length} connectors`}>
        {single && (
          <TextField
            key={single.id}
            value={single.data?.label ?? ''}
            placeholder="Label"
            onCommit={(label) => onEdges({ label })}
          />
        )}
        <Segmented
          value={same('routing')}
          onChange={(routing) => onEdges({ routing })}
          options={[
            { value: 'orthogonal', label: 'Elbow' },
            { value: 'straight', label: 'Straight' },
            { value: 'curved', label: 'Curved' },
          ]}
        />
        <Segmented
          value={same('arrows')}
          onChange={(arrows) => onEdges({ arrows })}
          options={[
            { value: 'none', label: 'No arrow' },
            { value: 'end', label: 'Arrow' },
            { value: 'both', label: 'Both' },
          ]}
        />
        <Segmented
          value={same('line')}
          onChange={(line) => onEdges({ line })}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
          ]}
        />
      </Group>
      <Group title="Line color">
        <Swatches<ColorKey> keys={COLOR_KEYS} value={same('color')} onChange={(color) => onEdges({ color })} kind="line" />
      </Group>
      <Group title="Flow">
        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Animate direction</span>
          <input
            type="checkbox"
            className="size-4 accent-(--brand) dark:scheme-dark"
            checked={same('animated') === true}
            onChange={(e) => onEdges({ animated: e.target.checked })}
          />
        </label>
      </Group>
    </>
  )
}

const shortcuts: [string, string][] = [
  ['Double-click', 'Edit text'],
  ['Drag a side dot', 'Connect'],
  ['Drag on canvas', 'Select area'],
  ['Space + drag / scroll', 'Pan'],
  ['⌘ + scroll / pinch', 'Zoom'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['⌘C ⌘V ⌘D', 'Copy, paste, duplicate'],
  ['⌘A', 'Select all'],
  ['Arrows', 'Nudge (⇧ = 10px)'],
  ['⌫', 'Delete'],
]

function CanvasOptions({ snapToGrid, onSnapToGrid }: PropertiesPanelProps) {
  return (
    <>
      <Group title="Canvas">
        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Snap to grid</span>
          <input
            type="checkbox"
            className="size-4 accent-(--brand) dark:scheme-dark"
            checked={snapToGrid}
            onChange={(e) => onSnapToGrid(e.target.checked)}
          />
        </label>
      </Group>
      <Group title="Shortcuts">
        <dl className="space-y-1.5 text-xs">
          {shortcuts.map(([keys, action]) => (
            <div key={keys} className="flex justify-between gap-2">
              <dt className="font-mono text-[11px] text-foreground">{keys}</dt>
              <dd className="text-right text-muted-foreground">{action}</dd>
            </div>
          ))}
        </dl>
      </Group>
    </>
  )
}

// ---------------------------------------------------------------- controls

function kindTitle(node: DiagramNode) {
  if (node.type === 'container') return 'Container'
  if (node.type === 'icon') return 'Icon'
  return node.data.shape === 'text' ? 'Text' : 'Shape'
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b px-3 py-3">
      <h3 className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

/** Commits on Enter or blur, so typing isn't one undo step per key. */
function TextField({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return (
    <Input
      value={draft}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-8 text-sm"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setDraft(value)
      }}
    />
  )
}

function Swatches<K extends FillKey>({
  keys,
  value,
  onChange,
  kind,
}: {
  keys: K[]
  value: K | undefined
  onChange: (key: K) => void
  kind: 'fill' | 'line'
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={colorNames[key]}
          title={colorNames[key]}
          onClick={() => onChange(key)}
          className={cn(
            'relative size-5 overflow-hidden rounded-full border border-foreground/15 transition-shadow',
            // Fill swatches get their line color as a border: the soft fills are hard to tell apart in dark mode.
            kind === 'fill' ? [bgClass[key], key !== 'none' && borderClass[key as ColorKey]] : swatchClass[key as ColorKey],
            value === key && 'ring-2 ring-brand ring-offset-1 ring-offset-background',
          )}
        >
          {key === 'none' && (
            <span className="absolute top-1/2 left-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-destructive" />
          )}
        </button>
      ))}
    </div>
  )
}

function Segmented<V extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: V | undefined
  onChange: (value: V) => void
  options: { value: V; label: string }[]
  className?: string
}) {
  return (
    <div className={cn('flex rounded-md border p-0.5', className)} role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 rounded-[5px] px-1.5 py-1 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
            value === option.value && 'bg-muted font-medium text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function IconButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn('justify-start', destructive && 'text-destructive hover:text-destructive')}
    >
      <Icon /> {label}
    </Button>
  )
}
