import type { Edge, Node, XYPosition } from '@xyflow/react'
import type { Json } from '@/types/database.types'
import { ICONS, type IconKey } from './icons'

// The diagram model, stored as `diagrams.data` ({ nodes, edges }). Only the
// fields listed in serialize() are saved; selection, measurements etc. are
// per-viewer React Flow state.

export type ColorKey = 'default' | 'blue' | 'teal' | 'green' | 'amber' | 'orange' | 'red' | 'pink' | 'violet'
export type FillKey = ColorKey | 'none'
export type LineStyle = 'solid' | 'dashed' | 'none'
export type TextSize = 'sm' | 'md' | 'lg'

export type ShapeKind =
  | 'rectangle'
  | 'rounded'
  | 'ellipse'
  | 'diamond'
  | 'cylinder'
  | 'parallelogram'
  | 'hexagon'
  | 'triangle'
  | 'document'
  | 'cloud'
  | 'note'
  | 'text'

export type DiagramNodeData = {
  label: string
  /** 'shape' nodes only. */
  shape?: ShapeKind
  /** 'icon' nodes only. */
  icon?: IconKey
  fill: FillKey
  /** Border color; the icon color on icon nodes. */
  stroke: ColorKey
  line: LineStyle
  text: TextSize
  bold: boolean
}

export type DiagramNodeType = 'shape' | 'icon' | 'container'
export type DiagramNode = Node<DiagramNodeData, DiagramNodeType>

export type Routing = 'orthogonal' | 'straight' | 'curved'
export type Arrows = 'none' | 'end' | 'both'

export type ConnectorData = {
  routing: Routing
  line: 'solid' | 'dashed'
  arrows: Arrows
  color: ColorKey
  label: string
  /** Moving dashes along the line ("show flow"). */
  animated: boolean
}
export type DiagramEdge = Edge<ConnectorData, 'connector'>

export type DiagramContent = { nodes: DiagramNode[]; edges: DiagramEdge[] }

// Layers (React Flow runs in zIndexMode="manual"): containers at the bottom
// (nested ones above their parents), connectors above containers, shapes on top.
const CONTAINER_Z = 0
export const EDGE_Z = 5
const NODE_Z = 10

export const defaultConnector: ConnectorData = {
  routing: 'orthogonal',
  line: 'solid',
  arrows: 'end',
  color: 'default',
  label: '',
  animated: false,
}

// ------------------------------------------------------------ library items

export type LibraryItem =
  | { type: 'shape'; shape: ShapeKind }
  | { type: 'icon'; icon: IconKey }
  | { type: 'container'; variant: 'solid' | 'dashed' }

const shapeDefaults: Record<ShapeKind, { label: string; w: number; h: number; data?: Partial<DiagramNodeData> }> = {
  rectangle: { label: 'Rectangle', w: 140, h: 72 },
  rounded: { label: 'Rounded', w: 140, h: 72 },
  ellipse: { label: 'Ellipse', w: 130, h: 80 },
  diamond: { label: 'Decision', w: 130, h: 100 },
  cylinder: { label: 'Cylinder', w: 110, h: 110 },
  parallelogram: { label: 'Input / output', w: 150, h: 72 },
  hexagon: { label: 'Hexagon', w: 140, h: 80 },
  triangle: { label: 'Triangle', w: 110, h: 96 },
  document: { label: 'Document', w: 130, h: 90 },
  cloud: { label: 'Cloud', w: 160, h: 100 },
  note: { label: 'Note', w: 160, h: 120, data: { fill: 'amber', stroke: 'amber' } },
  text: { label: 'Text', w: 140, h: 40, data: { fill: 'none', line: 'none' } },
}

export const shapeLabels = Object.fromEntries(
  Object.entries(shapeDefaults).map(([kind, def]) => [kind, def.label]),
) as Record<ShapeKind, string>

export const SHAPE_KINDS = Object.keys(shapeDefaults) as ShapeKind[]

const baseData: Omit<DiagramNodeData, 'label'> = {
  fill: 'default',
  stroke: 'default',
  line: 'solid',
  text: 'md',
  bold: false,
}

/** A new node for a library item, centered on `center` (flow coordinates). */
export function createNode(item: LibraryItem, center: XYPosition): DiagramNode {
  const id = crypto.randomUUID()
  const at = (w: number, h: number) => ({ x: Math.round(center.x - w / 2), y: Math.round(center.y - h / 2) })

  if (item.type === 'shape') {
    const def = shapeDefaults[item.shape]
    // Text starts with a label to type over; other shapes start empty, like Lucid.
    const label = item.shape === 'text' ? 'Text' : ''
    return {
      id,
      type: 'shape',
      position: at(def.w, def.h),
      width: def.w,
      height: def.h,
      zIndex: NODE_Z,
      data: { ...baseData, label, shape: item.shape, ...def.data },
    }
  }
  if (item.type === 'icon') {
    const def = ICONS[item.icon]
    return {
      id,
      type: 'icon',
      position: at(88, 88),
      width: 88,
      height: 88,
      zIndex: NODE_Z,
      data: { ...baseData, label: def.label, icon: item.icon, fill: 'none', line: 'none', stroke: def.color, text: 'sm' },
    }
  }
  return {
    id,
    type: 'container',
    position: at(400, 260),
    width: 400,
    height: 260,
    zIndex: CONTAINER_Z,
    data: {
      ...baseData,
      label: item.variant === 'dashed' ? 'Zone' : 'Group',
      fill: item.variant === 'dashed' ? 'none' : 'default',
      line: item.variant,
      text: 'sm',
      bold: true,
    },
  }
}

export function createEdge(source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null): DiagramEdge {
  return {
    id: crypto.randomUUID(),
    type: 'connector',
    source,
    target,
    sourceHandle: sourceHandle ?? null,
    targetHandle: targetHandle ?? null,
    zIndex: EDGE_Z,
    data: { ...defaultConnector },
  }
}

// ------------------------------------------------------------ ordering

function depth(node: DiagramNode, byId: Map<string, DiagramNode>): number {
  let d = 0
  let parent = node.parentId ? byId.get(node.parentId) : undefined
  while (parent && d < 20) {
    d += 1
    parent = parent.parentId ? byId.get(parent.parentId) : undefined
  }
  return d
}

/**
 * React Flow needs parents before their children. Containers come first
 * (shallowest first), then everything else in its current order; z-indexes
 * are (re)assigned to match the layers above.
 */
export function normalizeOrder(nodes: DiagramNode[]): DiagramNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const containers = nodes
    .filter((n) => n.type === 'container')
    .map((n) => ({ n, d: depth(n, byId) }))
    .sort((a, b) => a.d - b.d)
    .map(({ n, d }) => {
      const z = CONTAINER_Z + Math.min(d, EDGE_Z - 1)
      return n.zIndex === z ? n : { ...n, zIndex: z }
    })
  const others = nodes
    .filter((n) => n.type !== 'container')
    .map((n) => (n.zIndex === NODE_Z ? n : { ...n, zIndex: NODE_Z }))
  return [...containers, ...others]
}

/** The node and all of its descendants. */
export function withDescendants(ids: Iterable<string>, nodes: DiagramNode[]): Set<string> {
  const out = new Set(ids)
  let grew = true
  while (grew) {
    grew = false
    for (const n of nodes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id)
        grew = true
      }
    }
  }
  return out
}

// ------------------------------------------------------------ (de)serialize

/** What gets saved: no selection, measurements or other per-viewer state. */
export function serialize({ nodes, edges }: DiagramContent): Json {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      width: Math.round(n.width ?? n.measured?.width ?? 0),
      height: Math.round(n.height ?? n.measured?.height ?? 0),
      ...(n.parentId ? { parentId: n.parentId } : {}),
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      type: e.type,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      data: e.data,
    })),
  } as Json
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

const COLORS: ColorKey[] = ['default', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'violet']
const FILLS: FillKey[] = [...COLORS, 'none']

/** Stored JSON → editor content. Anything malformed is dropped, not trusted. */
export function parse(json: Json): DiagramContent {
  if (!isObject(json)) return { nodes: [], edges: [] }
  const rawNodes = Array.isArray(json.nodes) ? json.nodes : []
  const nodes: DiagramNode[] = []
  for (const raw of rawNodes) {
    if (!isObject(raw) || typeof raw.id !== 'string' || !isObject(raw.position) || !isObject(raw.data)) continue
    const type = oneOf<DiagramNodeType>(raw.type, ['shape', 'icon', 'container'], 'shape')
    const { x, y } = raw.position
    if (typeof x !== 'number' || typeof y !== 'number') continue
    const d = raw.data
    const data: DiagramNodeData = {
      label: typeof d.label === 'string' ? d.label : '',
      fill: oneOf(d.fill, FILLS, 'default'),
      stroke: oneOf(d.stroke, COLORS, 'default'),
      line: oneOf<LineStyle>(d.line, ['solid', 'dashed', 'none'], 'solid'),
      text: oneOf<TextSize>(d.text, ['sm', 'md', 'lg'], 'md'),
      bold: d.bold === true,
    }
    if (type === 'shape') data.shape = oneOf(d.shape, SHAPE_KINDS, 'rectangle')
    if (type === 'icon') data.icon = oneOf(d.icon, Object.keys(ICONS) as IconKey[], 'server')
    nodes.push({
      id: raw.id,
      type,
      position: { x, y },
      width: typeof raw.width === 'number' && raw.width > 0 ? raw.width : undefined,
      height: typeof raw.height === 'number' && raw.height > 0 ? raw.height : undefined,
      ...(typeof raw.parentId === 'string' ? { parentId: raw.parentId } : {}),
      data,
    })
  }
  // Drop parent links to missing or non-container nodes.
  const containers = new Set(nodes.filter((n) => n.type === 'container').map((n) => n.id))
  for (const n of nodes) if (n.parentId && (!containers.has(n.parentId) || n.parentId === n.id)) delete n.parentId

  const ids = new Set(nodes.map((n) => n.id))
  const rawEdges = Array.isArray(json.edges) ? json.edges : []
  const edges: DiagramEdge[] = []
  for (const raw of rawEdges) {
    if (!isObject(raw) || typeof raw.id !== 'string') continue
    if (typeof raw.source !== 'string' || typeof raw.target !== 'string') continue
    if (!ids.has(raw.source) || !ids.has(raw.target)) continue
    const d = isObject(raw.data) ? raw.data : {}
    edges.push({
      id: raw.id,
      type: 'connector',
      source: raw.source,
      target: raw.target,
      sourceHandle: typeof raw.sourceHandle === 'string' ? raw.sourceHandle : null,
      targetHandle: typeof raw.targetHandle === 'string' ? raw.targetHandle : null,
      zIndex: EDGE_Z,
      data: {
        routing: oneOf<Routing>(d.routing, ['orthogonal', 'straight', 'curved'], 'orthogonal'),
        line: oneOf(d.line, ['solid', 'dashed'] as const, 'solid'),
        arrows: oneOf<Arrows>(d.arrows, ['none', 'end', 'both'], 'end'),
        color: oneOf(d.color, COLORS, 'default'),
        label: typeof d.label === 'string' ? d.label : '',
        animated: d.animated === true,
      },
    })
  }
  return { nodes: normalizeOrder(nodes), edges }
}
