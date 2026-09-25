import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, CalendarPlus, Clock, LoaderCircle, Pencil, Trash2, Video } from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PersonAvatar } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import { useUserIdentity } from '@/features/auth/hooks'
import { DocScope } from '@/features/docs/components/DocScope'
import { useCurrentTeam } from '@/features/teams/hooks'
import { livePath, liveSessionPath } from '@/features/teams/nav'
import { errorMessage } from '@/lib/errors'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { deleteLiveSession, fetchJaasToken, type JaasToken, type LiveSession } from '../api'
import { useCalendarOps, useCalendarQueue, useCanWriteLive, useNow } from '../hooks'
import { canJoin, durationMinutes, EARLY_JOIN_MS, formatDay, formatDuration, formatTime, formatTimeRange, sessionStatus } from '../time'
import { ScheduleSessionDialog } from './ScheduleSessionDialog'

// The Jitsi SDK is only downloaded when someone joins.
const JitsiRoom = lazy(() => import('./JitsiRoom'))

type LiveSessionViewProps = {
  session: LiveSession
  /** Set when opened inside a workspace's Live tab. */
  workspaceId?: string
}

/** One live session: when, who it's for, the calendar invite, and the embedded call. */
export function LiveSessionView({ session, workspaceId }: LiveSessionViewProps) {
  useCalendarQueue()
  const { team } = useCurrentTeam()
  const identity = useUserIdentity()
  const canWrite = useCanWriteLive()(session.workspace_id)
  const calendarOps = useCalendarOps()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const now = useNow()
  const [jaas, setJaas] = useState<JaasToken | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const status = sessionStatus(session, now)
  const joinable = canJoin(session, now, canWrite)
  const listPath = livePath(team.slug, workspaceId)
  const eventUrl = `${window.location.origin}${liveSessionPath(team.slug, session.id, session.workspace_id ?? undefined)}`

  const join = useMutation({
    mutationFn: () => fetchJaasToken(session.id),
    onSuccess: setJaas,
    onError: (error) => toast.error(errorMessage(error)),
  })

  const syncCalendar = useMutation({
    mutationFn: () =>
      calendarOps([{ kind: 'sync', sessionId: session.id, url: eventUrl }], liveSessionPath(team.slug, session.id, workspaceId)),
    onSuccess: (result) => {
      if (result === 'done') toast.success('Google Calendar updated. Invites were sent.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const cancel = useMutation({
    mutationFn: async () => {
      await deleteLiveSession(session.id)
      // Leave first so this page doesn't render a deleted session.
      await navigate(listPath, { replace: true })
      await queryClient.invalidateQueries({ queryKey: ['live'] })
      if (!session.calendar_event_id) return
      try {
        await calendarOps([{ kind: 'delete', eventId: session.calendar_event_id }], listPath)
      } catch (error) {
        toast.error(`Session cancelled, but the calendar event wasn’t removed. ${errorMessage(error)}`)
      }
    },
    onSuccess: () => toast.success('Session cancelled.'),
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (jaas) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
            <h1 className="truncate text-sm font-semibold">{session.title}</h1>
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{formatTimeRange(session)}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setJaas(null)}>
            Leave call
          </Button>
        </div>
        <Suspense fallback={<div className="h-[calc(100svh-11rem)] min-h-[480px] rounded-lg border bg-muted" />}>
          <JitsiRoom
            jaas={jaas}
            subject={session.title}
            displayName={identity.name}
            email={identity.email ?? ''}
            onLeave={() => setJaas(null)}
          />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Video className="size-3.5" />
        <span>Live session</span>
        <span aria-hidden>·</span>
        <DocScope doc={session} />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{session.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="text-foreground">{formatDay(session.starts_at)}</span>
            <span className="font-mono">{formatTimeRange(session)}</span>
            <span aria-hidden>·</span>
            <span>{formatDuration(durationMinutes(session))}</span>
            <StatusBadge status={status} startsAt={session.starts_at} now={now} />
          </p>
        </div>
        {canWrite && (
          <div className="flex shrink-0 items-center gap-1">
            <ScheduleSessionDialog session={session} workspaceId={workspaceId}>
              <Button variant="ghost" size="icon-sm" aria-label="Edit session" className="text-muted-foreground">
                <Pencil />
              </Button>
            </ScheduleSessionDialog>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel session"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmCancel(true)}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-y py-4">
        <Button onClick={() => join.mutate()} disabled={!joinable || join.isPending}>
          {join.isPending ? <LoaderCircle className="animate-spin" /> : <Video />}
          {status === 'live' ? 'Join now' : 'Join call'}
        </Button>
        <span className="text-sm text-muted-foreground">
          {joinable
            ? status === 'upcoming' && canWrite && Date.parse(session.starts_at) - now > EARLY_JOIN_MS
              ? 'You can open the room early to set up.'
              : 'Opens in DevDock. Your camera and mic are off until you turn them on.'
            : status === 'upcoming'
              ? `Opens 15 minutes before it starts (${formatTime(new Date(Date.parse(session.starts_at) - EARLY_JOIN_MS).toISOString())}).`
              : 'This session has ended.'}
        </span>
      </div>

      <dl className="divide-y text-sm">
        <Detail label="For">
          <DocScope doc={session} />
        </Detail>
        <Detail label="Organizer">
          {session.author ? (
            <span className="flex items-center gap-2">
              <PersonAvatar profile={session.author} className="size-5" />
              {session.author.display_name ?? 'Unknown'}
            </span>
          ) : (
            <span className="text-muted-foreground">Unknown</span>
          )}
        </Detail>
        <Detail label="Calendar">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {session.calendar_event_id ? (
              <span className="flex items-center gap-1.5">
                <CalendarCheck className="size-4 text-muted-foreground" /> In Google Calendar, invites sent
              </span>
            ) : (
              <span className="text-muted-foreground">Not in Google Calendar</span>
            )}
            {canWrite && status !== 'ended' && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => syncCalendar.mutate()}
                disabled={syncCalendar.isPending}
              >
                {syncCalendar.isPending ? <LoaderCircle className="animate-spin" /> : <CalendarPlus />}
                {session.calendar_event_id ? 'Update invites' : 'Add to Google Calendar'}
              </Button>
            )}
          </span>
        </Detail>
        {session.description && (
          <Detail label="Notes">
            <p className="whitespace-pre-wrap">{session.description}</p>
          </Detail>
        )}
      </dl>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel ${session.title}?`}
        description={
          session.calendar_event_id
            ? 'The session is deleted and the Google Calendar event is cancelled for everyone invited.'
            : 'The session is deleted. This can’t be undone.'
        }
        confirmLabel="Cancel session"
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      />
    </div>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function StatusBadge({ status, startsAt, now }: { status: ReturnType<typeof sessionStatus>; startsAt: string; now: number }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
        status === 'live' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
      )}
    >
      {status === 'live' ? <span className="size-1.5 animate-pulse rounded-full bg-current" /> : <Clock className="size-3" />}
      {status === 'live' ? 'Live now' : status === 'ended' ? 'Ended' : `Starts ${timeAgo(startsAt, now)}`}
    </span>
  )
}
