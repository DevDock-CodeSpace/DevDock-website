// deno test supabase/functions/send-emails/templates.test.ts   (npm run test:emails)
// Set EMAIL_PREVIEW_DIR to also write each email as an HTML file to look at.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { formatRange, type Message, render } from './templates.ts'

const site = 'https://www.calsko.com'
const meeting = { starts_at: '2026-11-02T16:00:00Z', ends_at: '2026-11-02T16:30:00Z' }
const base = { team_name: 'DevDock Dev', workspace_name: 'Website', organizer: 'Dev Admin', path: '/t/devdock-dev/live/abc' }

const samples: Message[] = [
  {
    outbox_id: '1', kind: 'reminder', to_email: 'a@example.com', reply_to: null, time_zone: 'America/Chicago',
    data: { title: 'Grade the <quiz>', notes: 'Week 3\nBoth sections', team_name: 'DevDock Dev', workspace_name: 'Website', issue: 'WEB-12 Fix login', path: '/t/devdock-dev/w/x/issues/12' },
  },
  {
    outbox_id: '2', kind: 'feedback', to_email: null, reply_to: 'm@example.com', time_zone: null,
    data: { kind: 'idea', message: 'Dark mode for whiteboards would be great.', sender_name: 'Dev Member', sender_email: 'm@example.com', team_name: 'DevDock Dev', page: '/t/devdock-dev/docs', context: { browser: 'Chrome 141', screen: '1440x900' } },
  },
  {
    outbox_id: '3', kind: 'meeting_created', to_email: 'a@example.com', reply_to: null, time_zone: 'America/Chicago',
    data: { ...base, title: 'Standup', description: 'Bring your updates.', dates: [meeting] },
  },
  {
    outbox_id: '4', kind: 'series_created', to_email: 'a@example.com', reply_to: null, time_zone: 'Asia/Kolkata',
    data: { ...base, title: 'Weekly review', dates: Array.from({ length: 10 }, (_, i) => ({
      starts_at: new Date(Date.parse(meeting.starts_at) + i * 7 * 86_400_000).toISOString(),
      ends_at: new Date(Date.parse(meeting.ends_at) + i * 7 * 86_400_000).toISOString(),
    })) },
  },
  {
    outbox_id: '5', kind: 'meeting_changed', to_email: 'a@example.com', reply_to: null, time_zone: 'America/Chicago',
    data: { ...base, title: 'Standup 2', dates: [{ starts_at: '2026-11-02T17:00:00Z', ends_at: '2026-11-02T17:30:00Z' }], old: { old_title: 'Standup', old_starts_at: meeting.starts_at, old_ends_at: meeting.ends_at } },
  },
  {
    outbox_id: '6', kind: 'series_cancelled', to_email: 'a@example.com', reply_to: null, time_zone: null,
    data: { ...base, title: 'Weekly review', path: '/t/devdock-dev/live', dates: [meeting, { starts_at: '2026-11-09T16:00:00Z', ends_at: '2026-11-09T16:30:00Z' }] },
  },
  {
    outbox_id: '7', kind: 'chat', to_email: 'a@example.com', reply_to: null, time_zone: 'America/Chicago',
    data: { team_name: 'DevDock Dev', conversation_kind: 'channel', conversation_name: '#general', unread: 3, mentioned: true, path: '/t/devdock-dev/messages?c=x&m=y',
      messages: [
        { author: 'Dev Member', content: 'Can someone review <the> PR?', created_at: '2026-11-02T16:00:00Z', reply: false },
        { author: 'Ana', content: '@Vishwajeet this one\nthanks', created_at: '2026-11-02T16:05:00Z', reply: true },
      ] },
  },
]

Deno.test('times are written in the reader’s zone, UTC when unknown', () => {
  assertEquals(formatRange(meeting, 'America/Chicago'), 'Mon, Nov 2 · 10:00 AM – 10:30 AM CST')
  assertEquals(formatRange(meeting, null), 'Mon, Nov 2 · 4:00 PM – 4:30 PM UTC')
})

Deno.test('every kind renders, escapes names, and links into the site', async () => {
  const dir = Deno.env.get('EMAIL_PREVIEW_DIR')
  for (const message of samples) {
    const { subject, text, html } = render(message, site)
    assert(subject.length > 0 && text.length > 0, message.kind)
    assertStringIncludes(html, site)
    assert(!html.includes('<quiz>'), `${message.kind} escapes HTML`)
    if (dir) await Deno.writeTextFile(`${dir}/${message.kind}.html`, html)
  }
})

Deno.test('a change shows the old time and name', () => {
  const { subject, html } = render(samples[4], site)
  assertEquals(subject, 'Updated: Standup 2 · Mon, Nov 2 · 11:00 AM – 11:30 AM CST')
  assertStringIncludes(html, 'Was called')
  assertStringIncludes(html, '10:00 AM – 10:30 AM CST')
})

Deno.test('chat names who wrote and counts what isn’t shown', () => {
  const { subject, text } = render(samples[6], site)
  assertEquals(subject, 'Dev Member and Ana mentioned you in #general')
  assertStringIncludes(text, 'and 1 more')
})

Deno.test('a long series lists the first eight and counts the rest', () => {
  const { subject, text } = render(samples[3], site)
  assertEquals(subject, 'Invitation: Weekly review (repeating, 10 meetings)')
  assertStringIncludes(text, 'and 2 more')
})
