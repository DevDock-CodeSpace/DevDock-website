import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { conversationKeys, notificationsQuery } from '@/features/messaging/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import { errorMessage } from '@/lib/errors'

// When a note's time comes, the database puts a notification in the bell (a pg_cron job, whether or
// not a browser is open). This also shows it as a card on the right side of the screen, so a note you
// set a time for is hard to miss: it stays until you act on it, with Done and Snooze. It reads the bell's
// own query, so it makes no request of its own; the actions load the notes code only when clicked.

const SHOWN_KEY = 'devdock:notePopupsShown'
const KEEP = 200
/** A notification older than this was missed long ago; it stays in the bell without a pop-up. */
const FRESH_MS = 12 * 60 * 60_000
/** At most this many cards at once; the rest appear on the next refresh. */
const AT_ONCE = 3
const SNOOZE_MS = 10 * 60_000

function readShown(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}
function writeShown(ids: string[]) {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(ids.slice(-KEEP)))
  } catch {
    // Without storage a card can appear again after a reload. Better than missing one.
  }
}

export function NotePopups() {
  const { team } = useCurrentTeam()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const notifications = useQuery(notificationsQuery(team.id, user.id)).data

  useEffect(() => {
    if (!notifications) return
    const shown = new Set(readShown())
    const now = Date.now()
    const due = notifications.filter(
      (n) => n.kind === 'reminder' && n.reminder && n.reminder_id && !shown.has(n.id) && now - Date.parse(n.created_at) < FRESH_MS,
    )
    if (due.length === 0) return
    const refresh = () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: conversationKeys.notifications(team.id, user.id) }),
        queryClient.invalidateQueries({ queryKey: ['reminders', 'list'] }),
      ])
    for (const n of due.slice(0, AT_ONCE)) {
      shown.add(n.id)
      const noteId = n.reminder_id as string
      toast(n.reminder?.title ?? 'Note', {
        id: `note-${n.id}`,
        description: n.reminder?.notes ?? 'A note you set a time for',
        duration: Infinity,
        closeButton: true,
        action: {
          label: 'Done',
          onClick: () =>
            void import('../api')
              .then((api) => api.completeReminder(noteId))
              .then(refresh)
              .catch((error: unknown) => toast.error(errorMessage(error))),
        },
        cancel: {
          label: 'Snooze 10 min',
          onClick: () =>
            void Promise.all([import('../api'), import('@/features/messaging/api')])
              .then(async ([api, messaging]) => {
                await api.updateReminder(noteId, { remindAt: new Date(Date.now() + SNOOZE_MS).toISOString() })
                await messaging.markNotificationRead(n.id)
              })
              .then(refresh)
              .then(() => void toast.success('Snoozed for 10 minutes.'))
              .catch((error: unknown) => toast.error(errorMessage(error))),
        },
      })
    }
    writeShown([...shown])
  }, [notifications, queryClient, team.id, user.id])

  return null
}
