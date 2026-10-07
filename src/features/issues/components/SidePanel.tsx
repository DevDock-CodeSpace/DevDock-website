import { PanelRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function PanelToggle({ open, onChange }: { open: boolean; onChange: (open: boolean) => void }) {
  return (
    <Button
      variant={open ? 'secondary' : 'ghost'}
      size="icon-sm"
      aria-label={open ? 'Hide details panel' : 'Show details panel'}
      aria-pressed={open}
      title={open ? 'Hide details' : 'Show details'}
      onClick={() => onChange(!open)}
    >
      <PanelRight />
    </Button>
  )
}

/** The list with an optional details panel beside it (above it on narrow screens). */
export function SidePanelLayout({ open, panel, children }: { open: boolean; panel: ReactNode; children: ReactNode }) {
  return (
    <div className={cn(open && 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6')}>
      {open && (
        <aside aria-label="Details" className="mb-4 rounded-lg border bg-card/40 p-4 lg:sticky lg:top-16 lg:order-last lg:mb-0 lg:max-h-[calc(100svh-5rem)] lg:overflow-y-auto">
          {panel}
        </aside>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
