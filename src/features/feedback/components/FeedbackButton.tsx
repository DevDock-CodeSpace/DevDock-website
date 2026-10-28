import { MessageSquareText } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentTeam } from '@/features/teams/hooks'

// The form loads only when wanted (pointing at the button starts it), so the header carries only this.
const loadDialog = () => import('./FeedbackDialog')
const FeedbackDialog = lazy(() => loadDialog().then((m) => ({ default: m.FeedbackDialog })))

/** The header's Feedback button: tell the DevDock team about a problem or an idea. No request until sent. */
export function FeedbackButton() {
  const { team } = useCurrentTeam()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const warmUp = () => {
    setLoaded(true)
    void loadDialog()
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Send feedback"
            onPointerEnter={warmUp}
            onFocus={warmUp}
            onClick={() => {
              setLoaded(true)
              setOpen(true)
            }}
          >
            <MessageSquareText />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Send feedback</TooltipContent>
      </Tooltip>
      {loaded && (
        <Suspense fallback={null}>
          <FeedbackDialog open={open} onOpenChange={setOpen} teamId={team.id} />
        </Suspense>
      )}
    </>
  )
}
