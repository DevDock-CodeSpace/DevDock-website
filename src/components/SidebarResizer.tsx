import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { SidebarRail, useSidebar } from '@/components/ui/sidebar'
import type { SidebarWidth } from '@/hooks/use-sidebar-width'
import { SIDEBAR_DEFAULT } from '@/lib/sidebar-width'
import { cn } from '@/lib/utils'

const STEP = 16
const BIG_STEP = 48
/** A press that moves less than this is a click, not a drag. */
const DRAG_SLOP = 3

/**
 * The sidebar's right edge: drag it to change the width (between the minimum and maximum), double-click
 * to put it back, or focus it and use the arrow keys (Shift = bigger steps, Home / End = the limits).
 * While the sidebar is collapsed to icons the edge is the usual rail instead: click it to expand.
 */
export function SidebarResizer({ sidebar }: { sidebar: SidebarWidth }) {
  const { state, isMobile } = useSidebar()
  const press = useRef<{ startX: number; startWidth: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  if (isMobile) return null
  if (state === 'collapsed') return <SidebarRail />

  // The sidebar animates its width; that would make it lag behind the pointer while dragging.
  const animate = (handle: HTMLElement, on: boolean) => {
    const parts = [handle.closest<HTMLElement>('[data-slot="sidebar-container"]'), document.querySelector<HTMLElement>('[data-slot="sidebar-gap"]')]
    for (const part of parts) if (part) part.style.transition = on ? '' : 'none'
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    press.current = { startX: event.clientX, startWidth: sidebar.width, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    animate(event.currentTarget, false)
    setDragging(true)
    event.preventDefault()
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current
    if (!current) return
    const delta = event.clientX - current.startX
    if (!current.moved && Math.abs(delta) < DRAG_SLOP) return
    current.moved = true
    sidebar.set(current.startWidth + delta)
  }
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!press.current) return
    press.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    animate(event.currentTarget, true)
    setDragging(false)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP
    const target =
      event.key === 'ArrowLeft' ? sidebar.width - step
      : event.key === 'ArrowRight' ? sidebar.width + step
      : event.key === 'Home' ? sidebar.min
      : event.key === 'End' ? sidebar.max
      : event.key === 'Enter' ? SIDEBAR_DEFAULT
      : null
    if (target === null) return
    event.preventDefault()
    sidebar.set(target)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={sidebar.min}
      aria-valuemax={sidebar.max}
      aria-valuenow={sidebar.width}
      aria-valuetext={`${sidebar.width} pixels wide`}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={sidebar.reset}
      onKeyDown={onKeyDown}
      className={cn(
        'absolute inset-y-0 -right-1.5 z-20 hidden w-3 cursor-col-resize touch-none outline-none sm:block',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors',
        'hover:after:bg-sidebar-border focus-visible:after:bg-brand',
        dragging && 'after:bg-brand',
      )}
    />
  )
}
