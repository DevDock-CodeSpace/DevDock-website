import { lazy, Suspense } from 'react'
import { useCurrentTeam } from '@/features/teams/hooks'

// The form loads only when wanted: pointing at "Send feedback" in the profile menu starts it.
const loadDialog = () => import('./FeedbackDialog')
const FeedbackDialog = lazy(() => loadDialog().then((m) => ({ default: m.FeedbackDialog })))

/** Starts loading the Feedback form's code (call on hover or focus of whatever opens it). */
export const preloadFeedbackDialog = () => void loadDialog()

/**
 * The Feedback form, opened from the profile menu (`UserMenu`): tell the Calsko team about a problem or an idea.
 * Mount it only once it's wanted; it renders outside the menu so closing the menu doesn't close it. No request until sent.
 */
export function LazyFeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { team } = useCurrentTeam()
  return (
    <Suspense fallback={null}>
      <FeedbackDialog open={open} onOpenChange={onOpenChange} teamId={team.id} />
    </Suspense>
  )
}
