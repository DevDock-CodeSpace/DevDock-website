import { Suspense } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/features/auth/hooks'
import { useNow } from '@/features/live/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { remindersPath } from '@/features/teams/nav'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ReminderDialog } from './ReminderDialog'
import { ReminderSection } from './ReminderList'

/** All your notes, in a panel on the right: the same lists as the Notes page. Mounted only once opened. */
export default function NotesPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { team } = useCurrentTeam()
  const { user } = useAuth()
  const now = useNow()
  const section = { teamId: team.id, userId: user.id, now, highlight: null, auto: false }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Notes</SheetTitle>
          <SheetDescription>Only you can see them. A note with a time pops up then.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <Suspense fallback={<div className="h-24 animate-pulse rounded-md bg-muted/40" />}>
            <div className="flex items-center justify-between">
              <ReminderDialog />
              <Link to={remindersPath(team.slug)} onClick={() => onOpenChange(false)} className="text-xs text-muted-foreground hover:text-foreground">
                Open the Notes page
              </Link>
            </div>
            <ReminderSection
              {...section}
              title="Notes"
              status="pending"
              empty={
                <>
                  <span className="block font-medium text-foreground">No notes yet.</span>
                  Jot something down, and give it a time if you want it to pop up.
                </>
              }
            />
            <ReminderSection {...section} title="Done" status="completed" />
          </Suspense>
        </div>
      </SheetContent>
    </Sheet>
  )
}
