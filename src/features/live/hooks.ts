import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { useCanWriteDocs } from '@/features/docs/hooks'
import { errorMessage } from '@/lib/errors'
import { liveSessionQuery, seriesSessionsQuery, type LiveSession } from './api'
import { flushCalendarQueue, refreshRsvps, runCalendarOps, type CalendarOp } from './calendar'

/**
 * Who may schedule, edit and cancel sessions in a scope. The live_sessions
 * policies use the same private.can_write_document() as docs. UI only.
 */
export const useCanWriteLive = useCanWriteDocs

/** The current time, updated every `intervalMs` (session status changes as time passes). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function useLoadFresh() {
  const queryClient = useQueryClient()
  return (sessionId: string) => queryClient.fetchQuery({ ...liveSessionQuery(sessionId), staleTime: 0 })
}

/** Runs calendar changes now, or after a trip to Google when there's no token. */
export function useCalendarOps() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const load = useLoadFresh()
  return async (ops: CalendarOp[], returnTo: string) => {
    const result = await runCalendarOps(ops, { load, returnTo, email: user.email })
    if (result === 'done') await queryClient.invalidateQueries({ queryKey: ['live'] })
    return result
  }
}

/** On Meetings pages: finish calendar changes queued before a trip to Google. */
export function useCalendarQueue() {
  const queryClient = useQueryClient()
  const load = useLoadFresh()
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    flushCalendarQueue(load).then(
      async (count) => {
        if (count === null) return
        await queryClient.invalidateQueries({ queryKey: ['live'] })
        toast.success('Google Calendar updated. Invites were sent.')
      },
      (error: unknown) => toast.error(errorMessage(error)),
    )
    // Once per mount (`started` also guards StrictMode's double run).
  }, [load, queryClient])
}

/** The meetings of a series (soonest first); empty for one-off meetings. Loads after the page paints. */
export function useSeriesSessions(seriesId: string | null) {
  const query = useQuery({ ...seriesSessionsQuery(seriesId ?? ''), enabled: seriesId !== null })
  return query.data ?? []
}

/**
 * Pulls the invite replies from Google once when an organizer opens a meeting
 * they can edit and has a live calendar token. Never for readers, never on a
 * timer: the figures refresh when the organizer next looks at the page.
 */
export function useRefreshRsvps(session: LiveSession, enabled: boolean) {
  const queryClient = useQueryClient()
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !session.calendar_event_id || done.current === session.id) return
    done.current = session.id
    refreshRsvps(session).then(
      (updated) => {
        if (updated) void queryClient.invalidateQueries({ queryKey: ['live', session.id] })
      },
      (error: unknown) => console.error('[live] Could not refresh invite replies', error),
    )
  }, [enabled, session, queryClient])
}
