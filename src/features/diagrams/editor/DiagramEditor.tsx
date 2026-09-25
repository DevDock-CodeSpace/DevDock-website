import '@xyflow/react/dist/base.css'
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import type { Json } from '@/types/database.types'
import { cn } from '@/lib/utils'
import { ConnectorEdge } from './ConnectorEdge'
import { ContainerNode } from './ContainerNode'
import { DiagramEditorContext } from './context'
import { GuideLines } from './GuideLines'
import { snapToGuides, type Guides } from './guides'
import { IconNode } from './IconNode'
import {
  createEdge,
  createNode,
  normalizeOrder,
  serialize,
  withDescendants,
  type ConnectorData,
  type DiagramContent,
  type DiagramEdge,
  type DiagramNode,
  type DiagramNodeData,
  type LibraryItem,
} from './model'
import { PropertiesPanel, type Alignment } from './PropertiesPanel'
import { LIBRARY_DRAG_TYPE, ShapePanel } from './ShapePanel'
import { ShapeNode } from './ShapeNode'
import { Toolbar } from './Toolbar'
import { useHistory } from './useHistory'

const nodeTypes = { shape: ShapeNode, icon: IconNode, container: ContainerNode }
const edgeTypes = { connector: ConnectorEdge }

const GRID = 16
const PROPERTIES_KEY = 'devdock-diagram-properties'
const PASTE_OFFSET = 24

// React Flow's own colors, pointed at DevDock's theme tokens.
const flowStyle = {
  '--xy-background-color': 'var(--background)',
  '--xy-selection-background-color': 'color-mix(in oklab, var(--brand) 8%, transparent)',
  '--xy-selection-border': '1px solid var(--brand)',
  '--xy-connectionline-stroke': 'var(--brand)',
  '--xy-connectionline-stroke-width': '1.5',
} as CSSProperties

type Rect = { x: number; y: number; w: number; h: number }
type Clip = { nodes: DiagramNode[]; edges: DiagramEdge[] }

type DiagramEditorProps = {
  initial: DiagramContent
  readOnly: boolean
  /** Called with the saveable JSON whenever the diagram's content changes. */
  onChange: (data: Json) => void
  fullscreen: boolean
  onFullscreen: (on: boolean) => void
}

/** The Lucid-style editor: shape library | canvas | properties. */
export function DiagramEditor(props: DiagramEditorProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  )
}

function Editor({ initial, readOnly, onChange, fullscreen, onFullscreen }: DiagramEditorProps) {
  const flow = useReactFlow<DiagramNode, DiagramEdge>()
  const [nodes, setNodes] = useState(initial.nodes)
  const [edges, setEdges] = useState(initial.edges)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [guides, setGuides] = useState<Guides | null>(null)
  const [snapToGrid, setSnapToGrid] = useState(false)
  // Collapsing the properties panel is a per-viewer preference, remembered in this browser.
  const [propertiesOpen, setPropertiesOpen] = useState(() => {
    try {
      return localStorage.getItem(PROPERTIES_KEY) !== 'closed'
    } catch {
      return true
    }
  })
  const toggleProperties = () => {
    const next = !propertiesOpen
    setPropertiesOpen(next)
    try {
      localStorage.setItem(PROPERTIES_KEY, next ? 'open' : 'closed')
    } catch {
      // Storage unavailable (private mode): the choice lasts for this visit only.
    }
  }
  const canvas = useRef<HTMLDivElement>(null)

  const history = useHistory(
    useCallback(() => ({ nodes: flow.getNodes(), edges: flow.getEdges() }), [flow]),
    useCallback(({ nodes, edges }: DiagramContent) => {
      setNodes(nodes)
      setEdges(edges)
    }, []),
  )
  const { snapshot } = history

  // ------------------------------------------------------------ change → save
  const lastSaved = useRef<string | null>(null)
  useEffect(() => {
    const data = serialize({ nodes, edges })
    const text = JSON.stringify(data)
    if (lastSaved.current !== null && text !== lastSaved.current) onChange(data)
    lastSaved.current = text
  }, [nodes, edges, onChange])

  // ------------------------------------------------------------ geometry
  const rectOf = useCallback(
    (id: string): Rect | null => {
      const n = flow.getInternalNode(id)
      if (!n) return null
      const { x, y } = n.internals.positionAbsolute
      return { x, y, w: n.measured.width ?? n.width ?? 0, h: n.measured.height ?? n.height ?? 0 }
    },
    [flow],
  )

  /** Smallest container (not in `blocked`) whose box holds the rect's center, and that's bigger than it. */
  const findContainer = useCallback(
    (rect: Rect, blocked: Set<string>): { id: string; rect: Rect } | null => {
      const cx = rect.x + rect.w / 2
      const cy = rect.y + rect.h / 2
      let best: { id: string; rect: Rect } | null = null
      for (const n of flow.getNodes()) {
        if (n.type !== 'container' || blocked.has(n.id)) continue
        const r = rectOf(n.id)
        if (!r || r.w * r.h <= rect.w * rect.h) continue
        if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) continue
        if (!best || r.w * r.h < best.rect.w * best.rect.h) best = { id: n.id, rect: r }
      }
      return best
    },
    [flow, rectOf],
  )

  /** After a move: put nodes into (or take them out of) the container under them, like Lucid. */
  const reparent = useCallback(
    (ids: string[]) => {
      const all = flow.getNodes()
      const moving = new Set(ids)
      const updates = new Map<string, { parentId: string | undefined; position: XYPosition }>()
      for (const id of ids) {
        const node = all.find((n) => n.id === id)
        const rect = rectOf(id)
        if (!node || !rect) continue
        if (node.parentId && moving.has(node.parentId)) continue // moves with its parent
        const target = findContainer(rect, withDescendants([id], all))
        if (target?.id === node.parentId) continue
        updates.set(id, {
          parentId: target?.id,
          position: target ? { x: rect.x - target.rect.x, y: rect.y - target.rect.y } : { x: rect.x, y: rect.y },
        })
      }
      if (updates.size === 0) return
      setNodes((ns) =>
        normalizeOrder(
          ns.map((n) => {
            const u = updates.get(n.id)
            return u ? { ...n, parentId: u.parentId, position: u.position } : n
          }),
        ),
      )
    },
    [flow, rectOf, findContainer],
  )

  // ------------------------------------------------------------ React Flow events
  const onNodesChange = useCallback(
    (changes: NodeChange<DiagramNode>[]) => {
      let next = changes
      const [change] = changes
      // Alignment guides while dragging a single node.
      if (!snapToGrid && changes.length === 1 && change.type === 'position' && change.dragging && change.position) {
        const node = flow.getInternalNode(change.id)
        const self = rectOf(change.id)
        if (node && self) {
          const parent = node.parentId ? rectOf(node.parentId) : null
          const offset = { x: parent?.x ?? 0, y: parent?.y ?? 0 }
          const blocked = withDescendants([change.id], flow.getNodes())
          const others = flow
            .getNodes()
            .filter((n) => !blocked.has(n.id))
            .flatMap((n) => flow.getInternalNode(n.id) ?? [])
          const snapped = snapToGuides(
            { x: change.position.x + offset.x, y: change.position.y + offset.y, w: self.w, h: self.h },
            others,
            6 / flow.getZoom(),
          )
          next = [{ ...change, position: { x: snapped.x - offset.x, y: snapped.y - offset.y } }]
          setGuides(snapped.guides.x === undefined && snapped.guides.y === undefined ? null : snapped.guides)
        }
      } else if (changes.some((c) => c.type === 'position' && !c.dragging)) {
        setGuides(null)
      }
      setNodes((ns) => applyNodeChanges(next, ns))
    },
    [flow, rectOf, snapToGrid],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<DiagramEdge>[]) => setEdges((es) => applyEdgeChanges(changes, es)),
    [],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      snapshot()
      const edge = { ...createEdge(c.source, c.target, c.sourceHandle, c.targetHandle), selected: true }
      setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)))
      setEdges((es) => [...es.map((e) => (e.selected ? { ...e, selected: false } : e)), edge])
    },
    [snapshot],
  )

  const onReconnect = useCallback(
    (old: DiagramEdge, c: Connection) => {
      snapshot()
      setEdges((es) =>
        es.map((e) =>
          e.id === old.id
            ? { ...e, source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle }
            : e,
        ),
      )
    },
    [snapshot],
  )

  // ------------------------------------------------------------ editing actions
  const updateNode = useCallback(
    (id: string, patch: Partial<DiagramNodeData>) => {
      snapshot()
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)))
    },
    [snapshot],
  )
  const updateEdge = useCallback(
    (id: string, patch: Partial<ConnectorData>) => {
      snapshot()
      setEdges((es) => es.map((e) => (e.id === id && e.data ? { ...e, data: { ...e.data, ...patch } } : e)))
    },
    [snapshot],
  )
  const updateSelectedNodes = (patch: Partial<DiagramNodeData>) => {
    snapshot()
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, data: { ...n.data, ...patch } } : n)))
  }
  const updateSelectedEdges = (patch: Partial<ConnectorData>) => {
    snapshot()
    setEdges((es) => es.map((e) => (e.selected && e.data ? { ...e, data: { ...e.data, ...patch } } : e)))
  }

  /** Adds nodes (already positioned) as the new selection. */
  const insert = useCallback(
    (newNodes: DiagramNode[], newEdges: DiagramEdge[] = []) => {
      snapshot()
      setNodes((ns) =>
        normalizeOrder([
          ...ns.map((n) => (n.selected ? { ...n, selected: false } : n)),
          ...newNodes.map((n) => ({ ...n, selected: true })),
        ]),
      )
      setEdges((es) => [
        ...es.map((e) => (e.selected ? { ...e, selected: false } : e)),
        ...newEdges.map((e) => ({ ...e, selected: true })),
      ])
    },
    [snapshot],
  )

  const addCount = useRef(0)
  const addItem = useCallback(
    (item: LibraryItem, at?: XYPosition) => {
      let center = at
      if (!center) {
        // Clicked in the panel: the middle of the visible canvas, cascading repeated adds.
        const box = canvas.current?.getBoundingClientRect()
        const step = (addCount.current++ % 6) * PASTE_OFFSET
        center = flow.screenToFlowPosition({
          x: (box ? box.left + box.width / 2 : window.innerWidth / 2) + step,
          y: (box ? box.top + box.height / 2 : window.innerHeight / 2) + step,
        })
      }
      if (snapToGrid) center = { x: Math.round(center.x / GRID) * GRID, y: Math.round(center.y / GRID) * GRID }
      const node = createNode(item, center)
      const rect = { ...node.position, w: node.width ?? 0, h: node.height ?? 0 }
      const parent = findContainer(rect, new Set())
      if (parent) {
        node.parentId = parent.id
        node.position = { x: rect.x - parent.rect.x, y: rect.y - parent.rect.y }
      }
      insert([node])
    },
    [flow, findContainer, insert, snapToGrid],
  )

  const onDrop = useCallback(
    (event: DragEvent) => {
      const raw = event.dataTransfer.getData(LIBRARY_DRAG_TYPE)
      if (!raw) return
      event.preventDefault()
      addItem(JSON.parse(raw) as LibraryItem, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    },
    [addItem, flow],
  )

  // Copy/paste keeps a container's contents and the connectors between copied shapes.
  const clipboard = useRef<Clip | null>(null)
  const pasteCount = useRef(0)

  const collectSelection = useCallback((): Clip | null => {
    const all = flow.getNodes()
    const ids = withDescendants(
      all.filter((n) => n.selected).map((n) => n.id),
      all,
    )
    if (ids.size === 0) return null
    const nodes = all
      .filter((n) => ids.has(n.id))
      .map((n) => {
        if (!n.parentId || ids.has(n.parentId)) return n
        const r = rectOf(n.id) // parent not copied: detach at its absolute position
        return { ...n, parentId: undefined, position: r ? { x: r.x, y: r.y } : n.position }
      })
    const edges = flow.getEdges().filter((e) => ids.has(e.source) && ids.has(e.target))
    return { nodes, edges }
  }, [flow, rectOf])

  const paste = useCallback(
    (clip: Clip, offset: number) => {
      const map = new Map(clip.nodes.map((n) => [n.id, crypto.randomUUID()]))
      const newNodes = clip.nodes.map((n) => {
        const parentId = n.parentId ? map.get(n.parentId) : undefined
        return {
          ...n,
          id: map.get(n.id) ?? crypto.randomUUID(),
          parentId,
          // Only top-level pasted nodes move; children stay put inside their pasted parent.
          position: parentId ? n.position : { x: n.position.x + offset, y: n.position.y + offset },
          data: { ...n.data },
        }
      })
      const newEdges = clip.edges.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        source: map.get(e.source) ?? e.source,
        target: map.get(e.target) ?? e.target,
        data: e.data ? { ...e.data } : e.data,
      }))
      insert(newNodes, newEdges)
    },
    [insert],
  )

  const copy = useCallback(() => {
    const clip = collectSelection()
    if (!clip) return false
    clipboard.current = clip
    pasteCount.current = 0
    return true
  }, [collectSelection])

  const pasteClipboard = useCallback(() => {
    if (!clipboard.current) return
    pasteCount.current += 1
    paste(clipboard.current, PASTE_OFFSET * pasteCount.current)
  }, [paste])

  const duplicate = useCallback(() => {
    const clip = collectSelection()
    if (clip) paste(clip, PASTE_OFFSET)
  }, [collectSelection, paste])

  const deleteSelection = useCallback(() => {
    void flow.deleteElements({
      nodes: flow.getNodes().filter((n) => n.selected),
      edges: flow.getEdges().filter((e) => e.selected),
    })
  }, [flow])

  /** Selected nodes that aren't inside another selected node (those move with their parent). */
  const topSelected = () => {
    const selected = flow.getNodes().filter((n) => n.selected)
    const ids = new Set(selected.map((n) => n.id))
    return selected.filter((n) => !n.parentId || !ids.has(n.parentId))
  }

  /** Moves nodes to new absolute positions (converted back to parent-relative). */
  const moveTo = (positions: Map<string, XYPosition>) => {
    snapshot()
    setNodes((ns) =>
      ns.map((n) => {
        const abs = positions.get(n.id)
        if (!abs) return n
        const parent = n.parentId ? rectOf(n.parentId) : null
        return { ...n, position: { x: abs.x - (parent?.x ?? 0), y: abs.y - (parent?.y ?? 0) } }
      }),
    )
  }

  const align = (alignment: Alignment) => {
    const rects = topSelected().flatMap((n) => {
      const r = rectOf(n.id)
      return r ? [{ id: n.id, ...r }] : []
    })
    if (rects.length < 2) return
    const minX = Math.min(...rects.map((r) => r.x))
    const maxX = Math.max(...rects.map((r) => r.x + r.w))
    const minY = Math.min(...rects.map((r) => r.y))
    const maxY = Math.max(...rects.map((r) => r.y + r.h))
    const positions = new Map<string, XYPosition>()
    for (const r of rects) {
      const x = { left: minX, center: (minX + maxX) / 2 - r.w / 2, right: maxX - r.w }
      const y = { top: minY, middle: (minY + maxY) / 2 - r.h / 2, bottom: maxY - r.h }
      positions.set(r.id, {
        x: alignment in x ? x[alignment as keyof typeof x] : r.x,
        y: alignment in y ? y[alignment as keyof typeof y] : r.y,
      })
    }
    moveTo(positions)
  }

  const distribute = (axis: 'x' | 'y') => {
    const size = axis === 'x' ? 'w' : 'h'
    const rects = topSelected()
      .flatMap((n) => {
        const r = rectOf(n.id)
        return r ? [{ id: n.id, ...r }] : []
      })
      .sort((a, b) => a[axis] - b[axis])
    if (rects.length < 3) return
    const first = rects[0]
    const last = rects[rects.length - 1]
    const total = rects.reduce((sum, r) => sum + r[size], 0)
    const gap = (last[axis] + last[size] - first[axis] - total) / (rects.length - 1)
    const positions = new Map<string, XYPosition>()
    let cursor = first[axis]
    for (const r of rects) {
      positions.set(r.id, axis === 'x' ? { x: cursor, y: r.y } : { x: r.x, y: cursor })
      cursor += r[size] + gap
    }
    moveTo(positions)
  }

  const arrange = (to: 'front' | 'back') => {
    snapshot()
    setNodes((ns) => {
      const selected = ns.filter((n) => n.selected)
      const rest = ns.filter((n) => !n.selected)
      return normalizeOrder(to === 'front' ? [...rest, ...selected] : [...selected, ...rest])
    })
  }

  // ------------------------------------------------------------ keyboard
  const lastNudge = useRef(0)
  useEffect(() => {
    if (readOnly) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]')) return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) history.redo()
        else history.undo()
      } else if (mod && key === 'y') {
        event.preventDefault()
        history.redo()
      } else if (mod && key === 'c') {
        if (copy()) event.preventDefault()
      } else if (mod && key === 'x') {
        if (copy()) {
          event.preventDefault()
          deleteSelection()
        }
      } else if (mod && key === 'v') {
        if (clipboard.current) {
          event.preventDefault()
          pasteClipboard()
        }
      } else if (mod && key === 'd') {
        event.preventDefault()
        duplicate()
      } else if (mod && key === 'a') {
        event.preventDefault()
        setNodes((ns) => ns.map((n) => ({ ...n, selected: true })))
        setEdges((es) => es.map((e) => ({ ...e, selected: true })))
      } else if ((key === 'enter' || key === 'f2') && !mod) {
        const selected = flow.getNodes().filter((n) => n.selected)
        const selectedEdges = flow.getEdges().filter((e) => e.selected)
        if (selected.length === 1 && selectedEdges.length === 0) {
          event.preventDefault()
          setEditingId(selected[0].id)
        } else if (selectedEdges.length === 1 && selected.length === 0) {
          event.preventDefault()
          setEditingId(selectedEdges[0].id)
        }
      } else if (key.startsWith('arrow') && !mod) {
        const selected = topSelected()
        if (selected.length === 0) return
        event.preventDefault()
        // One undo step per burst of nudges.
        if (event.timeStamp - lastNudge.current > 600) snapshot()
        lastNudge.current = event.timeStamp
        const step = event.shiftKey ? 10 : 1
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
        const ids = new Set(selected.map((n) => n.id))
        setNodes((ns) =>
          ns.map((n) => (ids.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)),
        )
      } else if (key === 'escape') {
        setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)))
        setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // ------------------------------------------------------------ render
  const context = useMemo(
    () => ({ readOnly, editingId, setEditingId, snapshot, updateNode, updateEdge }),
    [readOnly, editingId, snapshot, updateNode, updateEdge],
  )
  const selectedNodes = nodes.filter((n) => n.selected)
  const selectedEdges = edges.filter((e) => e.selected)

  return (
    <DiagramEditorContext.Provider value={context}>
      <div className="flex size-full flex-col">
        <Toolbar
          readOnly={readOnly}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
          fullscreen={fullscreen}
          onFullscreen={onFullscreen}
          propertiesOpen={propertiesOpen}
          onToggleProperties={toggleProperties}
        />
        <div className="flex min-h-0 flex-1">
          {!readOnly && <ShapePanel onAdd={(item) => addItem(item)} />}
          <div ref={canvas} className="relative min-w-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <ReactFlow<DiagramNode, DiagramEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onBeforeDelete={async () => {
                snapshot()
                return true
              }}
              onNodeDragStart={snapshot}
              onSelectionDragStart={snapshot}
              onNodeDragStop={(_event, _node, dragged) => {
                setGuides(null)
                reparent(dragged.map((n) => n.id))
              }}
              onNodeDoubleClick={(_event, node) => !readOnly && setEditingId(node.id)}
              onEdgeDoubleClick={(_event, edge) => !readOnly && setEditingId(edge.id)}
              isValidConnection={(c) => c.source !== c.target}
              // Layers are set on nodes/edges by the model (containers < connectors < shapes).
              zIndexMode="manual"
              elevateNodesOnSelect={false}
              connectionMode={ConnectionMode.Loose}
              connectionLineType={ConnectionLineType.SmoothStep}
              connectionRadius={28}
              // Lucid-style navigation: drag on empty canvas selects, space/middle-drag or scroll pans.
              selectionOnDrag={!readOnly}
              selectionMode={SelectionMode.Partial}
              panOnDrag={readOnly ? true : [1, 2]}
              panOnScroll
              zoomOnDoubleClick={false}
              snapToGrid={snapToGrid}
              snapGrid={[GRID, GRID]}
              minZoom={0.1}
              maxZoom={4}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              elementsSelectable={!readOnly}
              edgesReconnectable={!readOnly}
              deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
              multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
              disableKeyboardA11y
              proOptions={{ hideAttribution: true }}
              style={flowStyle}
              className={cn(readOnly && '[&_.react-flow__node]:cursor-default')}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID} size={1.2} color="var(--border)" />
              <GuideLines guides={guides} />
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {readOnly ? 'This diagram is empty.' : 'Drag shapes and icons from the left, or click one to add it.'}
              </div>
            )}
          </div>
          {!readOnly && propertiesOpen && (
            <PropertiesPanel
              nodes={selectedNodes}
              edges={selectedEdges}
              onNodes={updateSelectedNodes}
              onEdges={updateSelectedEdges}
              onAlign={align}
              onDistribute={distribute}
              onArrange={arrange}
              onDuplicate={duplicate}
              onDelete={deleteSelection}
              snapToGrid={snapToGrid}
              onSnapToGrid={setSnapToGrid}
            />
          )}
        </div>
      </div>
    </DiagramEditorContext.Provider>
  )
}
