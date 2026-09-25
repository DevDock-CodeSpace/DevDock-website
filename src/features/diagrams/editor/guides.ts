import type { InternalNode } from '@xyflow/react'
import type { DiagramNode } from './model'

// Smart alignment guides (like Lucid's): while one node is dragged, snap its
// left/center/right and top/middle/bottom to other nodes' and draw a line.

export type Guides = { x?: number; y?: number }

type Box = { x: number; y: number; w: number; h: number }

const box = (n: InternalNode<DiagramNode>): Box => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  w: n.measured.width ?? n.width ?? 0,
  h: n.measured.height ?? n.height ?? 0,
})

/**
 * @param moving  the dragged node's proposed box (absolute flow coordinates)
 * @param others  nodes to align against
 * @param threshold  snap distance in flow units
 * @returns the snapped absolute position and the guide lines to draw
 */
export function snapToGuides(
  moving: Box,
  others: InternalNode<DiagramNode>[],
  threshold: number,
): { x: number; y: number; guides: Guides } {
  let bestX: { d: number; line: number } | undefined
  let bestY: { d: number; line: number } | undefined
  const xs = [moving.x, moving.x + moving.w / 2, moving.x + moving.w]
  const ys = [moving.y, moving.y + moving.h / 2, moving.y + moving.h]

  for (const other of others) {
    const o = box(other)
    for (const line of [o.x, o.x + o.w / 2, o.x + o.w]) {
      for (const x of xs) {
        const d = line - x
        if (Math.abs(d) < threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, line }
      }
    }
    for (const line of [o.y, o.y + o.h / 2, o.y + o.h]) {
      for (const y of ys) {
        const d = line - y
        if (Math.abs(d) < threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, line }
      }
    }
  }
  return {
    x: moving.x + (bestX?.d ?? 0),
    y: moving.y + (bestY?.d ?? 0),
    guides: { x: bestX?.line, y: bestY?.line },
  }
}
