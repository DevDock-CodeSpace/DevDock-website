import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { useCanWriteDocs } from '@/features/docs/hooks'
import { errorMessage } from '@/lib/errors'
import { liveSessionQuery } from './api'
import { flushCalendarQueue, runCalendarOps, type CalendarOp } from './calendar'

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

/** On Live pages: finish calendar changes queued before a trip to Google. */
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
