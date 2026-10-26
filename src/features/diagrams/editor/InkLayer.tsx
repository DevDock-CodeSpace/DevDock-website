import { useReactFlow, useStore } from '@xyflow/react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { cn } from '@/lib/utils'
import { inkClass } from './colors'
import { strokePath, touches } from './ink'
import type { ColorKey, DiagramEdge, DiagramNode, InkTool } from './model'

export type DrawTool = InkTool | 'eraser'

type Props = {
  tool: DrawTool
  color: ColorKey
  size: number
  /** A finished stroke, in flow coordinates ([x, y] or [x, y, pressure]). */
  onStroke: (points: number[][], pressure: boolean) => void
  /** Called once when an eraser gesture starts (one undo step per gesture). */
  onEraseStart: () => void
  onErase: (ids: string[]) => void
}

/** How far the eraser reaches, in screen pixels. */
const ERASER_RADIUS = 10
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/**
 * Sits over the canvas while a drawing tool is chosen and turns pointer moves into strokes.
 * It covers React Flow's own pan and zoom, so it does those itself: scroll pans, a trackpad
 * pinch or ⌘/Ctrl+scroll zooms, and two fingers on a touch screen pan and zoom.
 */
export function InkLayer({ tool, color, size, onStroke, onEraseStart, onErase }: Props) {
  const flow = useReactFlow<DiagramNode, DiagramEdge>()
  const [tx, ty, zoom] = useStore((s) => s.transform)
  const points = useRef<number[][] | null>(null)
  const pointer = useRef<number | null>(null)
  const realPressure = useRef(false)
  const [live, setLive] = useState<{ points: number[][]; pressure: boolean } | null>(null)
  const layer = useRef<HTMLDivElement>(null)
  // Fingers on the screen, for a two-finger pinch.
  const touches2 = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; cx: number; cy: number; zoom: number; x: number; y: number } | null>(null)

  // Wheel: a native listener, so ⌘/Ctrl+scroll can be kept from zooming the page.
  useEffect(() => {
    const el = layer.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const { x, y, zoom: z } = flow.getViewport()
      if (event.ctrlKey || event.metaKey) {
        const box = el.getBoundingClientRect()
        const px = event.clientX - box.left
        const py = event.clientY - box.top
        const next = clampZoom(z * Math.exp(-event.deltaY * 0.01))
        void flow.setViewport({ x: px - ((px - x) * next) / z, y: py - ((py - y) * next) / z, zoom: next })
      } else {
        void flow.setViewport({ x: x - event.deltaX, y: y - event.deltaY, zoom: z })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [flow])

  const startPinch = () => {
    const [a, b] = [...touches2.current.values()]
    const { x, y, zoom: z } = flow.getViewport()
    pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom: z, x, y }
  }
  const movePinch = () => {
    const start = pinch.current
    const el = layer.current
    if (!start || !el) return
    const [a, b] = [...touches2.current.values()]
    const box = el.getBoundingClientRect()
    const next = clampZoom((start.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / start.dist)
    const cx = (a.x + b.x) / 2 - box.left
    const cy = (a.y + b.y) / 2 - box.top
    const sx = start.cx - box.left
    const sy = start.cy - box.top
    // The canvas point that was under the fingers' midpoint stays under it.
    void flow.setViewport({ x: cx - ((sx - start.x) * next) / start.zoom, y: cy - ((sy - start.y) * next) / start.zoom, zoom: next })
  }

  const at = (event: PointerEvent) => {
    const p = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false })
    return [p.x, p.y, event.pressure || 0.5]
  }

  const erase = (event: PointerEvent) => {
    const [x, y] = at(event)
    const hit = flow
      .getNodes()
      .filter((n) => n.type === 'ink' && n.data.ink)
      .filter((n) => {
        const box = flow.getInternalNode(n.id)?.internals.positionAbsolute ?? n.position
        return touches(n.data.ink!, x - box.x, y - box.y, ERASER_RADIUS / zoom)
      })
      .map((n) => n.id)
    if (hit.length > 0) onErase(hit)
  }

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touches2.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touches2.current.size === 2) {
        // A second finger: this is a pinch, so the stroke the first finger began is dropped.
        pointer.current = null
        points.current = null
        setLive(null)
        startPinch()
        return
      }
    }
    // Left button, a finger or a pen.
    if (event.button !== 0 || pointer.current !== null || pinch.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointer.current = event.pointerId
    if (tool === 'eraser') {
      onEraseStart()
      erase(event)
      return
    }
    realPressure.current = event.pointerType === 'pen' && event.pressure > 0 && event.pressure !== 0.5
    points.current = [at(event)]
    setLive({ points: points.current, pressure: realPressure.current })
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (touches2.current.has(event.pointerId)) {
      touches2.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pinch.current && touches2.current.size >= 2) {
        movePinch()
        return
      }
    }
    if (event.pointerId !== pointer.current) return
    if (tool === 'eraser') {
      erase(event)
      return
    }
    const list = points.current
    if (!list) return
    // Coalesced events keep a fast stroke smooth; points closer than half a screen pixel add nothing.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
    for (const e of events) {
      const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }, { snapToGrid: false })
      const prev = list[list.length - 1]
      if (Math.hypot(p.x - prev[0], p.y - prev[1]) * zoom < 0.5) continue
      list.push([p.x, p.y, e.pressure || 0.5])
    }
    setLive({ points: [...list], pressure: realPressure.current })
  }

  const release = (event: PointerEvent<HTMLDivElement>) => {
    touches2.current.delete(event.pointerId)
    if (touches2.current.size < 2) pinch.current = null
  }

  const up = (event: PointerEvent<HTMLDivElement>) => {
    release(event)
    if (event.pointerId !== pointer.current) return
    pointer.current = null
    const list = points.current
    points.current = null
    setLive(null)
    // A tap leaves a dot: still a stroke.
    if (list && tool !== 'eraser') onStroke(list.length === 1 ? [list[0], [list[0][0] + 0.1, list[0][1] + 0.1, list[0][2]]] : list, realPressure.current)
  }

  const cancel = (event: PointerEvent<HTMLDivElement>) => {
    release(event)
    if (event.pointerId !== pointer.current) return
    pointer.current = null
    points.current = null
    setLive(null)
  }

  const inkTool = tool === 'eraser' ? null : tool
  return (
    <div
      ref={layer}
      className={cn('absolute inset-0 z-10 touch-none', tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair')}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
    >
      {live && inkTool && (
        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
          <g transform={`translate(${tx} ${ty}) scale(${zoom})`}>
            <path
              d={strokePath(live.points, inkTool, size, live.pressure, false)}
              className={cn(inkClass[color], inkTool === 'highlighter' && 'opacity-60 dark:opacity-50')}
            />
          </g>
        </svg>
      )}
    </div>
  )
}
