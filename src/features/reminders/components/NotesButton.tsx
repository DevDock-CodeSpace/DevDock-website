import { Bookmark } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// The panel (and the notes it lists) loads the first time it is opened, so the header carries only this button.
const NotesPanel = lazy(() => import('./NotesPanel'))

/** How long a note opened from its notification stays outlined. */
const HIGHLIGHT_MS = 2500

/**
 * The header's Notes button, next to Ask DevDock: opens all your notes in a panel on the right.
 * `?note=<id>` on any page (a note's notification, an old /reminders link) opens it at that note;
 * `?note=open` just opens it. The parameter is dropped once read.
 */
export function NotesButton() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const asked = params.get('note')

  // A new ?note= opens the panel straight away (set while rendering, not in an effect)…
  const [handled, setHandled] = useState<string | null>(null)
  if (asked && asked !== handled) {
    setHandled(asked)
    setLoaded(true)
    setOpen(true)
    setHighlight(asked === 'open' ? null : asked)
  }
  // …and the parameter is then taken out of the address.
  useEffect(() => {
    if (!asked) return
    setParams((current) => { const next = new URLSearchParams(current); next.delete('note'); return next }, { replace: true })
  }, [asked, setParams])

  useEffect(() => {
    if (!highlight) return
    const timer = window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS)
    return () => window.clearTimeout(timer)
  }, [highlight])

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            aria-label="Notes"
            onClick={() => {
              setLoaded(true)
              setOpen(true)
            }}
          >
            <Bookmark />
            <span className="hidden sm:inline">Notes</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Your notes</TooltipContent>
      </Tooltip>
      {loaded && (
        <Suspense fallback={null}>
          <NotesPanel open={open} onOpenChange={setOpen} highlight={highlight} />
        </Suspense>
      )}
    </>
  )
}
