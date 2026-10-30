import { cn } from '@/lib/utils'
import { statusLabel, type Status } from '../status'
import { useUserStatus } from '../store'

const LOOK: Record<Status, string> = {
  available: 'bg-emerald-500',
  call: 'bg-red-500',
  busy: 'bg-red-500',
  dnd: 'bg-red-500',
  away: 'bg-amber-400',
  offline: 'bg-background shadow-[inset_0_0_0_1.5px_var(--color-muted-foreground)]',
}

/** The dot for a status. White marks inside like Teams: a bar for Do not disturb, a handset for In a call, clock hands for Away. */
export function StatusMark({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      role="img"
      aria-label={statusLabel[status]}
      title={statusLabel[status]}
      className={cn('relative inline-flex size-2.5 shrink-0 items-center justify-center rounded-full', LOOK[status], className)}
    >
      {status === 'dnd' && <span className="h-[1.5px] w-[60%] rounded-full bg-white" />}
      {status === 'call' && (
        // A handset, so In a call reads differently from Busy (same red).
        <svg viewBox="0 0 24 24" className="size-[62%] fill-white" aria-hidden>
          <path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 0 0-1.02.24l-2.2 2.2a15 15 0 0 1-6.59-6.59l2.2-2.21a1 1 0 0 0 .25-1A11.4 11.4 0 0 1 8.5 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1c0 9.39 7.61 17 17 17a1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1z" />
        </svg>
      )}
      {status === 'away' && (
        // Clock hands, like Teams.
        <svg viewBox="0 0 10 10" className="size-full" aria-hidden>
          <path d="M5 2.4V5.3h2.1" fill="none" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

/** A person's live status on the corner of their avatar (the parent must be `relative`). */
export function StatusDot({ userId, className }: { userId: string; className?: string }) {
  const status = useUserStatus(userId)
  return <StatusMark status={status} className={cn('absolute -right-0.5 -bottom-0.5 ring-2 ring-background', className)} />
}
