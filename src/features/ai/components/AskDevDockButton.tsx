import { Sparkles } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentTeam } from '@/features/teams/hooks'
import { aiEnabled } from '../api'

// The panel (and everything it needs) loads the first time it is opened, so
// the header carries only this button.
const AskDevDockPanel = lazy(() => import('./AskDevDockPanel'))

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform)

/** The header's Ask DevDock button (⌘K / Ctrl+K). Renders nothing while the feature is off. */
export function AskDevDockButton() {
  const { team } = useCurrentTeam()
  const [open, setOpen] = useState(false)
  // Stays true once opened, so closing keeps the conversation.
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!aiEnabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(isMac ? event.metaKey : event.ctrlKey) || event.shiftKey || event.altKey) return
      if (event.defaultPrevented) return
      event.preventDefault()
      setLoaded(true)
      setOpen((value) => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!aiEnabled) return null
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            aria-label="Ask DevDock"
            onClick={() => {
              setLoaded(true)
              setOpen(true)
            }}
          >
            <Sparkles />
            <span className="hidden sm:inline">Ask</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Ask DevDock <kbd className="ml-1 font-mono text-[10px] opacity-70">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </TooltipContent>
      </Tooltip>
      {loaded && (
        <Suspense fallback={null}>
          {/* A new group is a new conversation: nothing said in one carries into another. */}
          <AskDevDockPanel key={team.id} open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  )
}
