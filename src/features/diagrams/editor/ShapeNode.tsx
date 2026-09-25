import type { NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { dashArray, fillClass, strokeClass, textClass } from './colors'
import { useDiagramEditor } from './context'
import { EditableText } from './EditableText'
import type { DiagramNode, ShapeKind } from './model'
import { NodeFrame } from './NodeFrame'
import { ShapeSvg } from './ShapeSvg'

/** Keeps the label inside the visible part of each shape. */
const labelPadding: Record<ShapeKind, string> = {
  rectangle: 'p-2',
  rounded: 'p-2',
  text: 'p-1',
  ellipse: 'px-[14%] py-2',
  diamond: 'px-[22%] py-[12%]',
  parallelogram: 'px-[18%] py-2',
  hexagon: 'px-[20%] py-2',
  triangle: 'px-[24%] pt-[38%] pb-2',
  document: 'px-2 pt-2 pb-4',
  cylinder: 'px-2 pt-7 pb-3',
  note: 'p-3 pr-5',
  cloud: 'px-[18%] pt-[14%] pb-[8%]',
}

export function ShapeNode({ id, data, selected, width = 0, height = 0 }: NodeProps<DiagramNode>) {
  const { editingId, setEditingId, updateNode } = useDiagramEditor()
  const shape = data.shape ?? 'rectangle'
  const line = data.line === 'none' ? 'stroke-transparent' : strokeClass[data.stroke]

  return (
    <NodeFrame selected={selected}>
      <ShapeSvg
        shape={shape}
        width={width}
        height={height}
        className={cn(fillClass[data.fill], line)}
        detailClassName={line}
        strokeDasharray={dashArray(data.line)}
      />
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center overflow-hidden text-center leading-snug text-foreground',
          labelPadding[shape],
          textClass[data.text],
          data.bold && 'font-semibold',
        )}
      >
        {editingId === id ? (
          <EditableText
            value={data.label}
            className="max-w-full"
            onDone={(label) => {
              setEditingId(null)
              if (label !== null && label !== data.label) updateNode(id, { label })
            }}
          />
        ) : (
          <span className="max-w-full whitespace-pre-wrap break-words">{data.label}</span>
        )}
      </div>
    </NodeFrame>
  )
}
