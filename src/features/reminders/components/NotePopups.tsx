import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/features/auth/hooks'
import { notificationsQuery } from '@/features/messaging/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import { openNotes } from '../openNotes'

// When a note's time comes, the database puts a notification in the bell (a pg_cron job, whether or
// not a browser is open). This opens the Notes panel at that note, under "Due now" with Done and
// Snooze, so a note you set a time for is hard to miss. It opens quietly (no overlay, focus left where
// it was) in case you're typing. It reads the bell's own query, so it makes no request of its own.

const SHOWN_KEY = 'devdock:notePopupsShown'
const KEEP = 200
/** A notification older than this was missed long ago; it stays in the bell without opening the panel. */
const FRESH_MS = 12 * 60 * 60_000

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
    // Without storage the panel can open again after a reload. Better than missing a note.
  }
}

export function NotePopups() {
  const { team } = useCurrentTeam()
  const { user } = useAuth()
  const notifications = useQuery(notificationsQuery(team.id, user.id)).data

  useEffect(() => {
    if (!notifications) return
    const shown = new Set(readShown())
    const now = Date.now()
    const due = notifications.filter(
      (n) => n.kind === 'reminder' && n.reminder && n.reminder_id && !shown.has(n.id) && now - Date.parse(n.created_at) < FRESH_MS,
    )
    if (due.length === 0) return
    for (const n of due) shown.add(n.id)
    writeShown([...shown])
    // Every due note is in the panel's "Due now"; it opens at the newest.
    const newest = due.reduce((a, b) => (Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a))
    openNotes({ noteId: newest.reminder_id ?? undefined, quiet: true })
  }, [notifications])

  return null
}
