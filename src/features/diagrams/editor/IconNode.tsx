import type { NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { bgClass, borderClass, iconClass, textClass } from './colors'
import { useDiagramEditor } from './context'
import { EditableText } from './EditableText'
import { ICONS } from './icons'
import type { DiagramNode } from './model'
import { NodeFrame } from './NodeFrame'

/** Space kept under the tile for the label. */
const LABEL_SPACE = { sm: 22, md: 24, lg: 30 }

/**
 * An architecture icon in an optional tile, with its label underneath: a Lucide glyph
 * in the node's color, or a cloud provider's own icon, drawn as it is (the providers
 * don't allow recoloring or distorting theirs).
 */
export function IconNode({ id, data, selected, width = 0, height = 0 }: NodeProps<DiagramNode>) {
  const { editingId, setEditingId, updateNode } = useDiagramEditor()
  const def = ICONS[data.icon ?? 'server'] ?? ICONS.server
  const Icon = def.icon
  const tile = Math.max(20, Math.min(width, height - LABEL_SPACE[data.text]))

  return (
    <NodeFrame selected={selected} minWidth={48} minHeight={48}>
      <div className="flex size-full flex-col items-center">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-xl',
            bgClass[data.fill],
            data.line !== 'none' && ['border-[1.5px]', borderClass[data.stroke]],
            data.line === 'dashed' && 'border-dashed',
          )}
          style={{ width: tile, height: tile }}
        >
          {Icon ? (
            <Icon className={iconClass[data.stroke]} style={{ width: tile * 0.6, height: tile * 0.6 }} strokeWidth={1.5} />
          ) : (
            <img
              src={def.src}
              alt=""
              draggable={false}
              className="pointer-events-none object-contain select-none"
              style={{ width: tile * 0.78, height: tile * 0.78 }}
            />
          )}
        </div>
        <div
          className={cn(
            'mt-1 w-full text-center leading-tight text-foreground',
            textClass[data.text],
            data.bold && 'font-semibold',
          )}
        >
          {editingId === id ? (
            <EditableText
              value={data.label}
              onDone={(label) => {
                setEditingId(null)
                if (label !== null && label !== data.label) updateNode(id, { label })
              }}
            />
          ) : (
            // Labels may be wider than the icon, like Lucid's.
            <span className="-mx-6 block whitespace-pre-wrap break-words">{data.label}</span>
          )}
        </div>
      </div>
    </NodeFrame>
  )
}
