import {
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react'
import { cn } from '@/lib/utils'
import { markerClass, strokeClass } from './colors'
import { useDiagramEditor } from './context'
import { arrowSize, onBorder } from './connector'
import { EditableText } from './EditableText'
import { defaultConnector, type DiagramEdge } from './model'

/**
 * A connector: right-angle, straight or curved, with optional arrowheads,
 * dashes, a moving "flow" animation and a label (double-click to edit).
 * Arrowheads are drawn per edge so they match its color in both themes.
 */
export function ConnectorEdge({
  id,
  data = defaultConnector,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  interactionWidth = 16,
}: EdgeProps<DiagramEdge>) {
  const { editingId, setEditingId, updateEdge } = useDiagramEditor()
  // React Flow measures from the outer edge of the connection dot, which sits half
  // outside the shape: start and end on the shape's border instead.
  const source = onBorder(sourceX, sourceY, sourcePosition)
  const target = onBorder(targetX, targetY, targetPosition)
  const geometry = { sourceX: source.x, sourceY: source.y, targetX: target.x, targetY: target.y, sourcePosition, targetPosition }
  // Shapes close together leave little room: the corners step out less and the
  // arrowhead shrinks, so it never covers the line or points back at its source.
  const gap = Math.hypot(target.x - source.x, target.y - source.y)
  const arrow = arrowSize(gap, data.arrows === 'both' ? 2 : 1)
  const [path, labelX, labelY] =
    data.routing === 'straight'
      ? getStraightPath(geometry)
      : data.routing === 'curved'
        ? getBezierPath(geometry)
        : getSmoothStepPath({ ...geometry, borderRadius: Math.min(8, gap / 4), offset: Math.min(24, Math.max(4, gap / 2)) })

  const startId = `dd-arrow-start-${id}`
  const endId = `dd-arrow-end-${id}`
  const color = selected ? 'fill-brand' : markerClass[data.color]
  const editing = editingId === id

  return (
    <>
      <defs>
        {/* userSpaceOnUse: the arrow keeps its size whatever the stroke width. */}
        <marker id={endId} viewBox="0 0 12 12" refX="11" refY="6" markerWidth={arrow} markerHeight={arrow} markerUnits="userSpaceOnUse" orient="auto">
          <path d="M1 1.5 L11 6 L1 10.5 Z" className={color} />
        </marker>
        <marker id={startId} viewBox="0 0 12 12" refX="11" refY="6" markerWidth={arrow} markerHeight={arrow} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M1 1.5 L11 6 L1 10.5 Z" className={color} />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        strokeWidth={selected ? 2 : 1.5}
        strokeDasharray={data.animated ? '5 5' : data.line === 'dashed' ? '6 4' : undefined}
        markerEnd={data.arrows !== 'none' && arrow > 0 ? `url(#${endId})` : undefined}
        markerStart={data.arrows === 'both' && arrow > 0 ? `url(#${startId})` : undefined}
        className={selected ? 'stroke-brand' : strokeClass[data.color]}
        // `dashdraw` comes with React Flow's stylesheet (its dash period matches 5 5).
        style={data.animated ? { animation: 'dashdraw 0.5s linear infinite' } : undefined}
      />
      {/* Wide invisible path so thin lines are easy to click. */}
      <path d={path} fill="none" strokeOpacity={0} strokeWidth={interactionWidth} className="react-flow__edge-interaction" />
      {(data.label || editing) && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              'nodrag nopan pointer-events-auto absolute rounded-sm bg-background px-1.5 py-0.5 text-center text-xs leading-snug text-foreground',
              selected && 'ring-1 ring-brand',
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onDoubleClick={() => setEditingId(id)}
          >
            {editing ? (
              <EditableText
                value={data.label}
                className="min-w-8"
                onDone={(label) => {
                  setEditingId(null)
                  if (label !== null && label !== data.label) updateEdge(id, { label })
                }}
              />
            ) : (
              <span className="block max-w-48 whitespace-pre-wrap break-words">{data.label}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

