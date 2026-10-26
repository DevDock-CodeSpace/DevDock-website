import { Check, MoreHorizontal, Pencil, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Reminder } from '../api'
import { useChangeNoteStatus } from '../hooks'

/** A note's ··· menu: edit, done, archive, or reopen a finished one. */
export function NoteMenu({ reminder, onEdit, className }: { reminder: Reminder; onEdit: () => void; className?: string }) {
  const change = useChangeNoteStatus()
  const pending = reminder.status === 'pending'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for “${reminder.title}”`} className={cn('relative z-10 text-muted-foreground', className)}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        {pending ? (
          <>
            <DropdownMenuItem onSelect={() => void change(reminder, 'completed', 'Note marked done.')}>
              <Check /> Mark done
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void change(reminder, 'cancelled', 'Note archived.')}>
              <X /> Archive
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={() => void change(reminder, 'pending', 'Note reopened.')}>
            <RotateCcw /> Reopen
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
