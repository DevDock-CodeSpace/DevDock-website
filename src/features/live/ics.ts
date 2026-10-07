import type { LiveSession } from './api'

// Calendar files (RFC 5545). A meeting downloads as an .ics that any calendar
// opens — Outlook/Teams, Google, Apple — so nobody needs to connect an account
// and DevDock needs no API keys for it.
//
// Times are written in UTC (the "Z" form), which needs no VTIMEZONE block. A
// repeating series is one event whose other occurrences are RDATE lines, each
// converted from the local time it was scheduled at, so a series keeps its
// wall-clock time across a daylight-saving change.

const pad = (n: number) => String(n).padStart(2, '0')

/** A Date as "20261007T143000Z". */
function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

/** Escapes a TEXT value: backslash, semicolon, comma and newlines (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/**
 * Folds a content line to 75 octets, continuing with a leading space.
 * Counted in UTF-8 bytes, and never splitting a character in half.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const decoder = new TextDecoder()
  const parts: string[] = []
  let start = 0
  // The first line takes 75 octets, continuations 74 (the leading space counts).
  while (start < bytes.length) {
    const limit = parts.length === 0 ? 75 : 74
    let end = Math.min(start + limit, bytes.length)
    // Don't cut inside a multi-byte character: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0b1100_0000) === 0b1000_0000) end--
    parts.push(decoder.decode(bytes.subarray(start, end)))
    start = end
  }
  return parts.join('\r\n ')
}

/** SEQUENCE must be a positive integer that grows with each edit; seconds since 2020 fits. */
function sequence(updatedAt: string): number {
  const seconds = Math.floor((Date.parse(updatedAt) - Date.UTC(2020, 0, 1)) / 1000)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
}

export type IcsOptions = {
  /** The meetings to write: one meeting, or a whole series (soonest first). */
  sessions: LiveSession[]
  /** Link back to a meeting in DevDock, put in its description and location. */
  url: (session: LiveSession) => string
}

/**
 * One VEVENT per meeting.
 *
 * A series is written as separate events rather than one repeating event with
 * RDATE: in DevDock each occurrence really is its own meeting that can be moved
 * or cancelled on its own, and clients disagree about whether an RDATE-only
 * event includes its DTSTART in the recurrence set (ical.js drops it), which
 * would silently lose the first meeting.
 */
export function buildIcs({ sessions, url }: IcsOptions): string {
  if (sessions.length === 0) throw new Error('Nothing to export')
  const stamp = utcStamp(new Date())

  const events = sessions.flatMap((session) => {
    const link = url(session)
    const description = [session.description?.trim(), `Join in DevDock: ${link}`].filter(Boolean).join('\n\n')
    return [
      'BEGIN:VEVENT',
      // Stable per meeting, so re-adding updates that event instead of duplicating it.
      `UID:${session.id}@devdock`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(new Date(session.starts_at))}`,
      `DTEND:${utcStamp(new Date(session.ends_at))}`,
      `SEQUENCE:${sequence(session.updated_at)}`,
      `SUMMARY:${escapeText(session.title)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `LOCATION:${escapeText(link)}`,
      `URL:${link}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    ]
  })

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DevDock//Meetings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** A safe, recognisable file name: "week-3-rest-apis.ics". */
export function icsFileName(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'meeting'
  return `${slug}.ics`
}

/** Hands the file to the browser as a download. */
export function downloadIcs(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // Give the download a tick to start before the blob goes away.
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

// ---------------------------------------------------------------- web links
//
// The "Add to calendar" links most sites use: a plain URL that opens Google
// Calendar or Outlook with the event filled in, for the person to save. No
// account connection, no API and no permission prompt — unlike the Google
// Calendar sync in calendar.ts, which edits the organizer's calendar directly
// and sends invites.
//
// A link carries one meeting, so a repeating series is offered as the .ics file.

/** "20261007T200000Z/20261007T210000Z" */
function stampRange(session: LiveSession): string {
  return `${utcStamp(new Date(session.starts_at))}/${utcStamp(new Date(session.ends_at))}`
}

function body(session: LiveSession, link: string): string {
  return [session.description?.trim(), `Join in DevDock: ${link}`].filter(Boolean).join('\n\n')
}

/** Opens Google Calendar's "new event" form, pre-filled. */
export function googleCalendarUrl(session: LiveSession, link: string): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: session.title,
    dates: stampRange(session),
    details: body(session, link),
    location: link,
  })
  return `https://www.google.com/calendar/render?${params}`
}

/** Opens Outlook (work/school, outlook.office.com) with the event filled in. */
export function outlookCalendarUrl(session: LiveSession, link: string): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: session.title,
    startdt: new Date(session.starts_at).toISOString(),
    enddt: new Date(session.ends_at).toISOString(),
    body: body(session, link),
    location: link,
  })
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params}`
}
