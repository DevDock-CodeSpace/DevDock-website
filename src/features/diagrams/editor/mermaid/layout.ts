// A parsed Mermaid graph → a DevDock diagram in its saved format ({ nodes, edges }, the shape
// of `diagrams.data`): sizes from the labels, positions from dagre, subgraphs as containers,
// ER entities as table blocks. The editor feeds the result through model.parse() like any
// paste, so nothing here is trusted. This module (and dagre) loads only when importing.
// Imports stay relative with extensions: Deno tests run it as is.

import dagre from '@dagrejs/dagre'
import { parseMermaid, type Color, type GraphNode, type MermaidGraph, type Shape, type Skipped, type Style } from './parse.ts'

type Box = { x: number; y: number; w: number; h: number }
type Handle = 't' | 'r' | 'b' | 'l'

/** A saved node, as model.ts's serialize() writes it. */
export type SavedNode = {
  id: string
  type: 'shape' | 'container' | 'block'
  position: { x: number; y: number }
  width: number
  height?: number
  parentId?: string
  data: {
    label: string
    body?: string
    block?: 'table'
    shape?: Shape
    fill: Color | 'none'
    stroke: Color
    line: 'solid' | 'dashed' | 'none'
    text: 'sm' | 'md' | 'lg'
    bold: boolean
  }
}
export type SavedEdge = {
  id: string
  type: 'connector'
  source: string
  target: string
  sourceHandle: Handle
  targetHandle: Handle
  data: {
    routing: 'orthogonal'
    line: 'solid' | 'dashed'
    arrows: 'none' | 'end' | 'both'
    color: Color
    label: string
    animated: false
  }
}
export type SavedDiagram = { nodes: SavedNode[]; edges: SavedEdge[] }

export type ImportResult =
  | {
      ok: true
      kind: MermaidGraph['kind']
      diagram: SavedDiagram
      /** Shapes and tables, containers and drawn connectors. */
      counts: { shapes: number; groups: number; connectors: number }
      skipped: Skipped[]
    }
  | { ok: false; error: string; skipped: Skipped[] }

// ------------------------------------------------------------ sizes

// The canvas draws labels in Geist at 14px (shapes) and 12px mono (tables). Widths are
// estimates: a shape is grown until its longest line fits, then wrapped lines add height.
const CHAR = 7.4
const LINE = 20
const MAX_TEXT = 200

/** Smallest size, and the share of the box the label may use (from ShapeNode's padding). */
const SHAPE_BOX: Record<Shape, { w: number; h: number; fx: number; fy: number; px: number; py: number }> = {
  rectangle: { w: 120, h: 52, fx: 1, fy: 1, px: 20, py: 20 },
  rounded: { w: 120, h: 52, fx: 1, fy: 1, px: 24, py: 20 },
  ellipse: { w: 120, h: 64, fx: 0.72, fy: 0.8, px: 8, py: 16 },
  diamond: { w: 140, h: 96, fx: 0.56, fy: 0.76, px: 8, py: 8 },
  cylinder: { w: 104, h: 88, fx: 1, fy: 1, px: 20, py: 48 },
  parallelogram: { w: 140, h: 52, fx: 0.64, fy: 1, px: 8, py: 20 },
  hexagon: { w: 140, h: 60, fx: 0.6, fy: 1, px: 8, py: 20 },
  triangle: { w: 120, h: 104, fx: 0.52, fy: 0.62, px: 8, py: 8 },
  document: { w: 130, h: 72, fx: 1, fy: 1, px: 20, py: 32 },
  cloud: { w: 160, h: 96, fx: 0.64, fy: 0.78, px: 8, py: 8 },
  text: { w: 80, h: 32, fx: 1, fy: 1, px: 12, py: 12 },
}

const up4 = (v: number) => Math.ceil(v / 4) * 4
const textWidth = (line: string) => [...line].length * CHAR

/** Shapes whose label area is a narrow middle band: their text wraps onto two lines rather than widening them. */
const NARROW: Shape[] = ['diamond', 'hexagon', 'ellipse', 'triangle', 'cloud', 'parallelogram']

function shapeSize(shape: Shape, label: string) {
  const box = SHAPE_BOX[shape]
  const lines = label.split('\n')
  const longestWord = Math.max(0, ...label.split(/\s+/).map(textWidth))
  const longestLine = Math.max(0, ...lines.map(textWidth))
  const longest = Math.min(MAX_TEXT, NARROW.includes(shape) ? Math.max(longestWord, longestLine / 2) : longestLine)
  const w = Math.min(360, Math.max(box.w, up4((longest + box.px) / box.fx)))
  const room = Math.max(CHAR * 4, w * box.fx - box.px)
  const rows = lines.reduce((n, line) => n + Math.max(1, Math.ceil(textWidth(line) / room)), 0)
  const h = Math.max(box.h, up4((rows * LINE + box.py) / box.fy))
  return { w, h }
}

/**
 * A table block (BlockNode's 12px mono table): a 32px key column, then name and type columns
 * that line up across rows, so the width is the longest name plus the longest type. Each row
 * is 25px; one with both PK and FK is taller, because the two badges stack.
 */
function tableSize(node: GraphNode) {
  const rows = (node.columns ?? []).map((row) => {
    const [name = '', ...rest] = row.split(' ')
    const keys = rest.filter((t) => /^(PK|FK)$/.test(t)).length
    return { name: [...name].length, type: [...rest.filter((t) => !/^(PK|FK)$/.test(t)).join(' ')].length, keys }
  })
  const MONO = 7.3
  const longest = (pick: (r: (typeof rows)[number]) => number) => Math.max(0, ...rows.map(pick))
  const columns = 32 + (longest((r) => r.name) + longest((r) => r.type)) * MONO + 40
  const w = Math.min(440, Math.max(200, up4(columns), up4([...node.label].length * 8.6 + 32)))
  const h = 34 + Math.max(1, rows.length) * 25 + rows.filter((r) => r.keys > 1).length * 13
  return { w, h }
}

function edgeLabelSize(label: string) {
  if (!label) return { width: 0, height: 0 }
  const lines = label.split('\n')
  return { width: Math.min(200, Math.max(...lines.map((l) => [...l].length)) * 6.6 + 16), height: lines.length * 16 + 8 }
}

// ------------------------------------------------------------ layout

/** Room inside a container: the title sits in the top band. */
const PAD = { side: 24, top: 44, bottom: 24 }

/**
 * Which sides a connector leaves and enters by, from where the two boxes ended up. A link
 * that goes back against the flow (a retry loop: "Show error → Enter credentials") runs
 * around the side, both ends on the same side, so it never cuts through the shapes between.
 */
function handlesFor(a: Box, b: Box, direction: MermaidGraph['direction']): [Handle, Handle] {
  const vertical = direction === 'TB' || direction === 'BT'
  const back =
    direction === 'TB'
      ? b.y + b.h <= a.y
      : direction === 'BT'
        ? b.y >= a.y + a.h
        : direction === 'LR'
          ? b.x + b.w <= a.x
          : b.x >= a.x + a.w
  if (back) {
    if (vertical) return a.x + a.w / 2 < b.x + b.w / 2 ? ['l', 'l'] : ['r', 'r']
    return a.y + a.h / 2 < b.y + b.h / 2 ? ['t', 't'] : ['b', 'b']
  }
  const below = b.y >= a.y + a.h
  const above = b.y + b.h <= a.y
  const right = b.x >= a.x + a.w
  const left = b.x + b.w <= a.x
  const verticalWay = below ? 'down' : above ? 'up' : null
  const horizontalWay = right ? 'right' : left ? 'left' : null
  const contains = (o: Box, i: Box) => i.x >= o.x && i.y >= o.y && i.x + i.w <= o.x + o.w && i.y + i.h <= o.y + o.h
  if (!verticalWay && !horizontalWay && (contains(a, b) || contains(b, a))) {
    // A shape linked to its own container: both ends on the same side reads best.
    return vertical ? ['t', 't'] : ['l', 'l']
  }
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  const way =
    (vertical ? (verticalWay ?? horizontalWay) : (horizontalWay ?? verticalWay)) ??
    (vertical ? (dy >= 0 ? 'down' : 'up') : dx >= 0 ? 'right' : 'left')
  return way === 'down' ? ['b', 't'] : way === 'up' ? ['t', 'b'] : way === 'right' ? ['r', 'l'] : ['l', 'r']
}

/** Lays out a parsed graph and writes it in the saved format. Positions start at (0, 0). */
export function layoutGraph(graph: MermaidGraph): SavedDiagram {
  const er = graph.kind === 'er'
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true })
  g.setGraph({
    rankdir: graph.direction,
    nodesep: er ? 64 : 48,
    ranksep: er ? 80 : 64,
    edgesep: 20,
    marginx: 0,
    marginy: 0,
  })
  g.setDefaultEdgeLabel(() => ({}))

  const nodeKey = (id: string) => `n:${id}`
  const groupKey = (id: string) => `g:${id}`
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  const groupIds = new Set(graph.groups.map((gr) => gr.id))
  // A link may name a node or a subgraph; a node wins when both have the id.
  const keyOf = (id: string) => (nodeIds.has(id) ? nodeKey(id) : groupIds.has(id) ? groupKey(id) : null)

  const sizes = new Map<string, { w: number; h: number }>()
  for (const node of graph.nodes) {
    const size = er ? tableSize(node) : shapeSize(node.shape, node.label)
    sizes.set(nodeKey(node.id), size)
    g.setNode(nodeKey(node.id), { width: size.w, height: size.h })
  }
  const childCount = new Map<string, number>()
  for (const node of graph.nodes) if (node.parent) childCount.set(node.parent, (childCount.get(node.parent) ?? 0) + 1)
  for (const group of graph.groups) if (group.parent) childCount.set(group.parent, (childCount.get(group.parent) ?? 0) + 1)
  for (const group of graph.groups) {
    // An empty subgraph is laid out as an ordinary box the size of its title.
    const empty = !childCount.get(group.id)
    const size = { w: Math.max(160, up4(textWidth(group.label) + 2 * PAD.side)), h: 80 }
    if (empty) sizes.set(groupKey(group.id), size)
    g.setNode(groupKey(group.id), empty ? { width: size.w, height: size.h } : {})
  }
  for (const group of graph.groups) if (group.parent && groupIds.has(group.parent)) g.setParent(groupKey(group.id), groupKey(group.parent))
  for (const node of graph.nodes) if (node.parent && groupIds.has(node.parent)) g.setParent(nodeKey(node.id), groupKey(node.parent))

  // dagre can't link to a cluster: for the layout, a link to a subgraph goes to its first shape.
  const leafOf = (key: string): string => {
    const children = g.children(key) ?? []
    if (children.length === 0) return key
    return leafOf(children[0])
  }
  const ancestors = (key: string) => {
    const out = new Set<string>()
    for (let p = g.parent(key); p; p = g.parent(p)) out.add(p)
    return out
  }
  graph.edges.forEach((edge, i) => {
    const from = keyOf(edge.from)
    const to = keyOf(edge.to)
    if (!from || !to || from === to) return
    // A link between a shape and its own container doesn't rank anything.
    if (ancestors(from).has(to) || ancestors(to).has(from)) return
    const a = leafOf(from)
    const b = leafOf(to)
    if (a === b) return
    g.setEdge(a, b, { ...edgeLabelSize(edge.label), labelpos: 'c', minlen: 1 }, String(i))
  })

  dagre.layout(g)

  // Absolute boxes: shapes from dagre, containers around their contents (deepest first).
  const boxes = new Map<string, Box>()
  for (const node of graph.nodes) {
    const key = nodeKey(node.id)
    const laid = g.node(key)
    const size = sizes.get(key)!
    boxes.set(key, { x: (laid.x ?? 0) - size.w / 2, y: (laid.y ?? 0) - size.h / 2, w: size.w, h: size.h })
  }
  const depth = (key: string) => ancestors(key).size
  const groupKeys = graph.groups.map((gr) => groupKey(gr.id)).sort((a, b) => depth(b) - depth(a))
  for (const key of groupKeys) {
    const children = (g.children(key) ?? []).map((c) => boxes.get(c)).filter((b): b is Box => Boolean(b))
    if (children.length === 0) {
      const laid = g.node(key)
      const size = sizes.get(key) ?? { w: 160, h: 80 }
      boxes.set(key, { x: (laid.x ?? 0) - size.w / 2, y: (laid.y ?? 0) - size.h / 2, w: size.w, h: size.h })
      continue
    }
    const minX = Math.min(...children.map((b) => b.x)) - PAD.side
    const minY = Math.min(...children.map((b) => b.y)) - PAD.top
    const maxX = Math.max(...children.map((b) => b.x + b.w)) + PAD.side
    const maxY = Math.max(...children.map((b) => b.y + b.h)) + PAD.bottom
    const title = textWidth(graph.groups.find((gr) => groupKey(gr.id) === key)?.label ?? '') + 2 * PAD.side
    boxes.set(key, { x: minX, y: minY, w: Math.max(maxX - minX, title), h: maxY - minY })
  }

  // Start at (0, 0), on whole pixels.
  const all = [...boxes.values()]
  const originX = Math.min(...all.map((b) => b.x))
  const originY = Math.min(...all.map((b) => b.y))
  for (const box of all) {
    box.x = Math.round(box.x - originX)
    box.y = Math.round(box.y - originY)
    box.w = Math.round(box.w)
    box.h = Math.round(box.h)
  }

  // Saved nodes, parents first; a child's position is relative to its container.
  const ids = new Map<string, string>()
  for (const key of boxes.keys()) ids.set(key, crypto.randomUUID())
  const relative = (key: string, parent: string | undefined) => {
    const box = boxes.get(key)!
    const origin = parent ? boxes.get(parent)! : { x: 0, y: 0 }
    return { x: box.x - origin.x, y: box.y - origin.y }
  }
  const nodes: SavedNode[] = []
  for (const key of [...groupKeys].reverse()) {
    const group = graph.groups.find((gr) => groupKey(gr.id) === key)!
    const parent = group.parent && groupIds.has(group.parent) ? groupKey(group.parent) : undefined
    const box = boxes.get(key)!
    nodes.push({
      id: ids.get(key)!,
      type: 'container',
      position: relative(key, parent),
      width: box.w,
      height: box.h,
      ...(parent ? { parentId: ids.get(parent)! } : {}),
      data: {
        label: group.label,
        ...colors(group.style, 'default'),
        line: group.style.dashed ? 'dashed' : 'solid',
        text: 'sm',
        bold: true,
      },
    })
  }
  for (const node of graph.nodes) {
    const key = nodeKey(node.id)
    const parent = node.parent && groupIds.has(node.parent) ? groupKey(node.parent) : undefined
    const box = boxes.get(key)!
    const common = {
      id: ids.get(key)!,
      position: relative(key, parent),
      width: box.w,
      ...(parent ? { parentId: ids.get(parent)! } : {}),
    }
    if (er) {
      nodes.push({
        ...common,
        type: 'block',
        data: {
          label: node.label,
          body: (node.columns ?? []).join('\n'),
          block: 'table',
          fill: node.style.fill ?? 'blue',
          stroke: node.style.stroke ?? 'default',
          line: 'solid',
          text: 'md',
          bold: false,
        },
      })
      continue
    }
    const text = node.shape === 'text'
    nodes.push({
      ...common,
      type: 'shape',
      height: box.h,
      data: {
        label: node.label,
        shape: node.shape,
        ...(text ? { fill: node.style.fill ?? 'none', stroke: node.style.stroke ?? 'default' } : colors(node.style, 'default')),
        line: text && !node.style.stroke ? 'none' : node.style.dashed ? 'dashed' : 'solid',
        text: 'md',
        bold: node.style.bold ?? false,
      },
    })
  }

  const edges: SavedEdge[] = []
  for (const edge of graph.edges) {
    if (edge.hidden) continue
    const from = keyOf(edge.from)
    const to = keyOf(edge.to)
    if (!from || !to) continue
    const [sourceHandle, targetHandle] = from === to ? (['r', 't'] as const) : handlesFor(boxes.get(from)!, boxes.get(to)!, graph.direction)
    edges.push({
      id: crypto.randomUUID(),
      type: 'connector',
      source: ids.get(from)!,
      target: ids.get(to)!,
      sourceHandle,
      targetHandle,
      data: {
        routing: 'orthogonal',
        line: edge.dashed ? 'dashed' : 'solid',
        arrows: edge.arrows,
        color: edge.color ?? 'default',
        label: edge.label,
        animated: false,
      },
    })
  }
  return { nodes, edges }
}

/** Fill and border from a Mermaid style. A colored fill without a stroke gets a matching border, like the shape panel's swatches. */
function colors(style: Style, fallback: Color): { fill: Color | 'none'; stroke: Color } {
  const fill = style.fill ?? fallback
  const stroke = style.stroke ?? (fill !== 'none' && fill !== 'default' ? fill : 'default')
  return { fill, stroke }
}

/** Mermaid code (from findMermaid) → a laid-out diagram, or why it can't be imported. */
export function mermaidToDiagram(code: string): ImportResult {
  const parsed = parseMermaid(code)
  if (!parsed.ok) return parsed
  const { graph, skipped } = parsed
  const diagram = layoutGraph(graph)
  return {
    ok: true,
    kind: graph.kind,
    diagram,
    counts: {
      shapes: graph.nodes.length,
      groups: graph.groups.length,
      connectors: diagram.edges.length,
    },
    skipped,
  }
}
