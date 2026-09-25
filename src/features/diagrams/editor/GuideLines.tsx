import { useStore, ViewportPortal } from '@xyflow/react'
import type { Guides } from './guides'

/** Draws the active guides in flow coordinates. */
export function GuideLines({ guides }: { guides: Guides | null }) {
  const zoom = useStore((s) => s.transform[2])
  if (!guides) return null
  const thickness = 1 / zoom
  return (
    <ViewportPortal>
      {guides.x !== undefined && (
        <div
          className="pointer-events-none absolute bg-brand"
          style={{ left: guides.x - thickness / 2, top: -100000, width: thickness, height: 200000 }}
        />
      )}
      {guides.y !== undefined && (
        <div
          className="pointer-events-none absolute bg-brand"
          style={{ top: guides.y - thickness / 2, left: -100000, height: thickness, width: 200000 }}
        />
      )}
    </ViewportPortal>
  )
}
