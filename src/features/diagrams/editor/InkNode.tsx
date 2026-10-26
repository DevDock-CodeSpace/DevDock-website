import type { NodeProps } from '@xyflow/react'
import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { inkClass } from './colors'
import { strokePath, unflatten } from './ink'
import type { DiagramNode } from './model'

/** A freehand stroke. Only the drawn line takes clicks (the node itself has pointer-events off). */
export const InkNode = memo(function InkNode({ data, selected, width, height }: NodeProps<DiagramNode>) {
  const ink = data.ink
  const path = useMemo(() => (ink ? strokePath(unflatten(ink), ink.tool, ink.size, ink.pressure) : ''), [ink])
  if (!ink) return null
  return (
    <svg
      width={width}
      height={height}
      className={cn('block overflow-visible', selected && 'rounded-sm outline-1 outline-offset-2 outline-brand outline-dashed')}
      aria-hidden
    >
      <path
        d={path}
        className={cn(inkClass[data.stroke], ink.tool === 'highlighter' && 'opacity-60 dark:opacity-50')}
        style={{ pointerEvents: 'visiblePainted' }}
      />
    </svg>
  )
})
