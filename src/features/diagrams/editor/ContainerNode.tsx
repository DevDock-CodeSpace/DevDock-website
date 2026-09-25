import type { NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { dashArray, fillClass, iconClass, strokeClass, textClass } from './colors'
import { useDiagramEditor } from './context'
import { EditableText } from './EditableText'
import type { DiagramNode } from './model'
import { NodeFrame } from './NodeFrame'

/**
 * A group/zone (VPC, subnet, "Backend"…). Shapes dropped inside become its
 * children and move with it; it always stays behind shapes and connectors.
 */
export function ContainerNode({ id, data, selected, width = 0, height = 0 }: NodeProps<DiagramNode>) {
  const { editingId, setEditingId, updateNode } = useDiagramEditor()
  const line = data.line === 'none' ? 'stroke-transparent' : strokeClass[data.stroke]

  return (
    <NodeFrame selected={selected} minWidth={80} minHeight={60}>
      <svg width={width} height={height} className="absolute inset-0 overflow-visible" aria-hidden>
        <rect
          x={1}
          y={1}
          width={Math.max(0, width - 2)}
          height={Math.max(0, height - 2)}
          rx={10}
          // The default fill is a soft muted tone rather than the card color.
          className={cn(data.fill === 'default' ? 'fill-muted' : fillClass[data.fill], line)}
          fillOpacity={0.6}
          strokeWidth={1.5}
          strokeDasharray={dashArray(data.line)}
        />
      </svg>
      <div
        className={cn(
          'absolute top-2 right-3 left-3 truncate',
          data.stroke === 'default' ? 'text-muted-foreground' : iconClass[data.stroke],
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
          data.label
        )}
      </div>
    </NodeFrame>
  )
}
