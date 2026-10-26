import getStroke from 'perfect-freehand'
import type { InkStroke, InkTool } from './model'

// How strokes are drawn: the same settings for the live stroke and the saved one,
// so what you see while drawing is what stays.

/** Pen thicknesses (S, M, L) and the highlighter's, in canvas units. */
export const PEN_SIZES = [2, 4, 8] as const
export const HIGHLIGHTER_SIZE = 18

function options(tool: InkTool, size: number, pressure: boolean, last: boolean) {
  return tool === 'highlighter'
    ? { size, thinning: 0, smoothing: 0.5, streamline: 0.5, simulatePressure: false, last }
    : { size, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: !pressure, last }
}

/** The outline of a stroke as an SVG path (perfect-freehand gives a polygon; this smooths it). */
export function strokePath(points: number[][], tool: InkTool, size: number, pressure: boolean, last = true): string {
  const outline = getStroke(points, options(tool, size, pressure, last))
  if (outline.length < 2) return ''
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  let d = `M${outline[0][0].toFixed(1)},${outline[0][1].toFixed(1)}Q`
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const m = mid(a, b)
    d += `${a[0].toFixed(1)},${a[1].toFixed(1)} ${m[0].toFixed(1)},${m[1].toFixed(1)} `
  }
  return `${d}Z`
}

/** A saved stroke's flat points back to [x, y(, pressure)] pairs. */
export function unflatten(ink: InkStroke): number[][] {
  const stride = ink.pressure ? 3 : 2
  const out: number[][] = []
  for (let i = 0; i + stride - 1 < ink.points.length; i += stride) out.push(ink.points.slice(i, i + stride))
  return out
}

/** Whether a point (relative to the stroke's node) is within `radius` of the stroke's line. */
export function touches(ink: InkStroke, x: number, y: number, radius: number): boolean {
  const reach = (radius + ink.size / 2) ** 2
  const stride = ink.pressure ? 3 : 2
  for (let i = 0; i + 1 < ink.points.length; i += stride) {
    const dx = ink.points[i] - x
    const dy = ink.points[i + 1] - y
    if (dx * dx + dy * dy <= reach) return true
  }
  return false
}
