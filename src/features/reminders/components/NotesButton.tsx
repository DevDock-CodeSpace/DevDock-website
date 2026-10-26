import { Bookmark } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// The panel (and the notes it lists) loads the first time it is opened, so the header carries only this button.
const NotesPanel = lazy(() => import('./NotesPanel'))

/** The header's Notes button, next to Ask DevDock: opens all your notes in a panel on the right. */
export function NotesButton() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
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
          <NotesPanel open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  )
}
