import { useInfiniteQuery } from '@tanstack/react-query'
import { Bookmark, ChevronRight, Lock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useAuth } from '@/features/auth/hooks'
import { useNow } from '@/features/live/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { cn } from '@/lib/utils'
import { remindersPageQuery } from '../api'
import { NoteComposer } from './NoteComposer'
import { PendingNotes } from './PendingNotes'
import { ReminderSection } from './ReminderList'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A note to scroll to and outline (from its notification). */
  highlight: string | null
  /**
   * Opened by DevDock because a note's time came, not by a click: no dim overlay, focus stays where
   * it was (someone may be typing), and clicking the page doesn't close it. Close or Esc does.
   */
  quiet: boolean
}

/**
 * All your notes, in a panel on the right: the only place notes live (there's no Notes page).
 * The open notes (due now, coming up, anytime), then Done and Archived folded, with a write box
 * at the bottom. Mounted only once wanted.
 */
export default function NotesPanel({ open, onOpenChange, highlight, quiet }: Props) {
  const { team } = useCurrentTeam()
  const { user } = useAuth()
  const now = useNow()
  const [doneOpen, setDoneOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const done = useInfiniteQuery(remindersPageQuery(team.id, user.id, 'completed'))
  const doneCount = done.data?.pages[0]?.total
  const section = { teamId: team.id, userId: user.id, now, highlight }
  const keepFocus = (event: Event) => quiet && event.preventDefault()

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={!quiet}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        onOpenAutoFocus={keepFocus}
        onInteractOutside={keepFocus}
      >
        <SheetHeader className="flex-row items-center gap-3 px-4 pt-4 pb-3 pr-12">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Bookmark className="size-4.5" />
          </span>
          <div className="min-w-0">
            <SheetTitle className="text-base">Notes</SheetTitle>
            <SheetDescription className="flex items-center gap-1 text-xs">
              <Lock className="size-3" /> Only you can see these
            </SheetDescription>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto border-t px-4 pt-4 pb-6">
          <PendingNotes {...section} />

          <section aria-label="Done" className="mt-6 border-t pt-3">
            <button
              type="button"
              onClick={() => setDoneOpen((v) => !v)}
              aria-expanded={doneOpen}
              className="flex w-full items-center gap-2 rounded-md py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
            >
              <ChevronRight className={cn('size-3.5 transition-transform', doneOpen && 'rotate-90')} />
              Done
              {doneCount !== undefined && <span className="font-mono font-normal">{doneCount}</span>}
            </button>
            {doneOpen && (
              <div className="mt-1.5">
                <ReminderSection {...section} status="completed" auto={!showArchived} />
                {showArchived && (
                  <div className="mt-3">
                    <h4 className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">Archived</h4>
                    <ReminderSection {...section} status="cancelled" auto />
                  </div>
                )}
                <Button variant="ghost" size="xs" className="mt-2 text-muted-foreground" onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? 'Hide archived' : 'Show archived'}
                </Button>
              </div>
            )}
          </section>
        </div>
        {/* At the bottom, like Chat's composer: the notes scroll above it. */}
        <div className="border-t bg-popover px-4 pt-3 pb-4">
          <NoteComposer />
        </div>
      </SheetContent>
    </Sheet>
  )
}
