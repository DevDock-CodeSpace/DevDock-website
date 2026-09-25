import { Handle, NodeResizer, Position, useConnection } from '@xyflow/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useDiagramEditor } from './context'

const SIDES = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
] as const

type NodeFrameProps = {
  selected: boolean
  minWidth?: number
  minHeight?: number
  /** Keep the width/height ratio while resizing (icons). */
  keepAspectRatio?: boolean
  className?: string
  children: ReactNode
}

/**
 * What every node shares: a connection point on each side (shown on hover,
 * and on every node while a connector is being drawn), resize handles when
 * selected, and the selection outline.
 */
export function NodeFrame({ selected, minWidth = 24, minHeight = 24, keepAspectRatio, className, children }: NodeFrameProps) {
  const { readOnly, snapshot } = useDiagramEditor()
  const connecting = useConnection((c) => c.inProgress)

  return (
    <div className={cn('group/node relative size-full', className)}>
      {children}
      {!readOnly && (
        <>
          <NodeResizer
            isVisible={selected}
            minWidth={minWidth}
            minHeight={minHeight}
            keepAspectRatio={keepAspectRatio}
            onResizeStart={snapshot}
            color="var(--brand)"
            lineClassName="border-brand!"
            handleClassName="size-2! rounded-[2px]! border-brand! bg-background!"
          />
          {SIDES.map((side) => (
            // ConnectionMode.Loose: every handle is a source that can also receive.
            <Handle
              key={side.id}
              id={side.id}
              type="source"
              position={side.position}
              className={cn(
                'z-10 size-2.5! rounded-full! border-[1.5px]! border-brand! bg-background! transition-opacity',
                connecting || selected ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100',
              )}
            />
          ))}
        </>
      )}
      {readOnly && SIDES.map((side) => (
        // Edges still need anchors to attach to in read-only mode.
        <Handle key={side.id} id={side.id} type="source" position={side.position} isConnectable={false} className="opacity-0!" />
      ))}
    </div>
  )
}
