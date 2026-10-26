import { Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/hooks'
import { useNow } from '@/features/live/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ReminderDialog } from './ReminderDialog'
import { ReminderSection } from './ReminderList'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A note to scroll to and outline (from its notification). */
  highlight: string | null
}

/**
 * All your notes, in a panel on the right: the only place notes live (there's no Notes page).
 * Open notes, then Done, then Archived when asked for; the last section shown loads more as you
 * scroll. Mounted only once opened.
 */
export default function NotesPanel({ open, onOpenChange, highlight }: Props) {
  const { team } = useCurrentTeam()
  const { user } = useAuth()
  const now = useNow()
  const [showArchived, setShowArchived] = useState(false)
  const section = { teamId: team.id, userId: user.id, now, highlight }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="gap-1 border-b pr-12">
          <SheetTitle>Notes</SheetTitle>
          <SheetDescription>Only you can see them. Give one a time and it pops up then.</SheetDescription>
          <div className="pt-2">
            <ReminderDialog />
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <Suspense fallback={<div className="h-24 animate-pulse rounded-md bg-muted/40" />}>
            <ReminderSection
              {...section}
              title="Notes"
              status="pending"
              auto={false}
              empty={
                <>
                  <span className="block font-medium text-foreground">No notes yet.</span>
                  Jot something down, and give it a time if you want it to pop up.
                </>
              }
            />
            <ReminderSection {...section} title="Done" status="completed" auto={!showArchived} />
            {showArchived && <ReminderSection {...section} title="Archived" status="cancelled" auto />}
            <div className="flex justify-center pb-2">
              <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? 'Hide archived' : 'Show archived'}
              </Button>
            </div>
          </Suspense>
        </div>
      </SheetContent>
    </Sheet>
  )
}
