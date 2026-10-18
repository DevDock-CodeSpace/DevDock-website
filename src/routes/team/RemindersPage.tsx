import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/hooks'
import { useNow } from '@/features/live/hooks'
import { ReminderDialog } from '@/features/reminders/components/ReminderDialog'
import { ReminderSection } from '@/features/reminders/components/ReminderList'
import { useCurrentTeam } from '@/features/teams/hooks'

/**
 * Group → Reminders: your own reminders in this group (nobody else sees them). Personal, so it
 * isn't narrowed to the collection in view. `?r=<id>` (from a notification) outlines one;
 * `?show=cancelled` adds the cancelled ones.
 */
export function RemindersPage() {
  const { team } = useCurrentTeam()
  const { user } = useAuth()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const highlight = params.get('r')
  const showCancelled = params.get('show') === 'cancelled'

  // The outline is a pointer, not a state: drop it after a moment.
  useEffect(() => {
    if (!highlight) return
    const timer = window.setTimeout(
      () => setParams((p) => { const next = new URLSearchParams(p); next.delete('r'); return next }, { replace: true }),
      2500,
    )
    return () => window.clearTimeout(timer)
  }, [highlight, setParams])

  const toggleCancelled = () =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (showCancelled) next.delete('show')
      else next.set('show', 'cancelled')
      return next
    }, { replace: true })

  const section = { teamId: team.id, userId: user.id, now, highlight }
  return (
    <>
      <PageHeader title="Reminders" description={`Your reminders in ${team.name}. Only you can see them.`}>
        <ReminderDialog />
      </PageHeader>
      <div className="space-y-8">
        <ReminderSection
          {...section}
          title="Upcoming"
          status="pending"
          auto={false}
          empty={
            <>
              <span className="block font-medium text-foreground">No upcoming reminders.</span>
              Create one for something you don’t want to forget.
            </>
          }
        />
        <ReminderSection {...section} title="Completed" status="completed" auto={!showCancelled} />
        {showCancelled && <ReminderSection {...section} title="Cancelled" status="cancelled" auto />}
        <div className="flex justify-center">
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={toggleCancelled}>
            {showCancelled ? 'Hide cancelled' : 'Show cancelled'}
          </Button>
        </div>
      </div>
    </>
  )
}
