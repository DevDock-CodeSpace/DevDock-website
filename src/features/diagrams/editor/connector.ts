// Connector geometry, kept apart from the component so it can be tested on its own.

import { Position } from '@xyflow/react'

/** Half the connection dot (size-2.5 in NodeFrame): how far outside the border React Flow puts a connector's end. */
export const HANDLE_OUTSET = 5

/** A connector end moved from the outside of its connection dot onto the shape's border. */
export function onBorder(x: number, y: number, side: Position): { x: number; y: number } {
  if (side === Position.Right) return { x: x - HANDLE_OUTSET, y }
  if (side === Position.Left) return { x: x + HANDLE_OUTSET, y }
  if (side === Position.Bottom) return { x, y: y - HANDLE_OUTSET }
  return { x, y: y + HANDLE_OUTSET }
}

/**
 * Arrowhead size for a connector whose ends are `gap` apart: 12 normally, smaller
 * when the arrowheads would take more than about 40% of the line, and none when the shapes
 * (nearly) touch and there is no line to point along.
 */
export function arrowSize(gap: number, heads: 1 | 2): number {
  if (gap < 4) return 0
  return Math.max(4, Math.min(12, gap / (2.5 * heads)))
}
