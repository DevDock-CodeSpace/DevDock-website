// What each queued email says. Pure: data in (from public.email_claim_batch), subject/text/html out, so
// `deno test` can render them without a database or Resend.

import { button, details, escapeHtml as e, layout, oneLine, panel, para, paragraphs } from '../_shared/email.ts'

export type Message = {
  outbox_id: string
  kind: string
  to_email: string | null
  reply_to: string | null
  time_zone: string | null
  data: Record<string, unknown>
}

export type Rendered = { subject: string; text: string; html: string }

type Range = { starts_at: string; ends_at: string }

const str = (value: unknown) => (typeof value === 'string' ? value : '')

/** "Mon, Nov 2 · 10:00 – 10:30 AM CST", in the reader's zone (UTC when unknown). */
export function formatRange(range: Range, timeZone: string | null) {
  const zone = timeZone ?? 'UTC'
  const start = new Date(range.starts_at)
  const end = new Date(range.ends_at)
  const day = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' })
  const time = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' })
  const zoneName =
    new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(end)
      .find((part) => part.type === 'timeZoneName')?.value ?? zone
  const sameDay = day.format(start) === day.format(end)
  return sameDay
    ? `${day.format(start)} · ${time.format(start)} – ${time.format(end)} ${zoneName}`
    : `${day.format(start)} ${time.format(start)} – ${day.format(end)} ${time.format(end)} ${zoneName}`
}

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

function googleUrl(title: string, range: Range, link: string) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(range.starts_at)}/${stamp(range.ends_at)}`,
    details: `Join on Calsko: ${link}`,
    location: link,
  })
  return `https://www.google.com/calendar/render?${params}`
}

function outlookUrl(title: string, range: Range, link: string) {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: new Date(range.starts_at).toISOString(),
    enddt: new Date(range.ends_at).toISOString(),
    body: `Join on Calsko: ${link}`,
    location: link,
  })
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params}`
}

const SHOWN_DATES = 8

function dateList(dates: Range[], zone: string | null, strike = false) {
  const shown = dates.slice(0, SHOWN_DATES).map((d) => formatRange(d, zone))
  const more = dates.length - shown.length
  const style = strike ? ' style="text-decoration:line-through;color:#6b7280"' : ''
  return {
    html: shown.map((line) => `<span${style}>${e(line)}</span>`).join('<br>') + (more > 0 ? `<br>and ${more} more` : ''),
    text: shown.map((line) => `- ${line}`).join('\n') + (more > 0 ? `\n- and ${more} more` : ''),
  }
}

function place(data: Record<string, unknown>) {
  const team = oneLine(str(data.team_name))
  const workspace = oneLine(str(data.workspace_name))
  return workspace ? `${workspace} · ${team}` : team
}

const MEETING_FOOTER = [
  'You get this because you’re in this meeting’s audience on Calsko.',
  'Turn meeting emails off in Calsko: click your name → Email.',
]

function meeting(message: Message, site: string): Rendered {
  const { kind, data, time_zone: zone } = message
  const title = oneLine(str(data.title)) || 'Meeting'
  const organizer = oneLine(str(data.organizer)) || 'Someone'
  const dates = (Array.isArray(data.dates) ? data.dates : []) as Range[]
  const first = dates[0]
  const link = `${site}${str(data.path)}`
  const series = kind.startsWith('series_')
  const where = place(data)
  const description = str(data.description)

  if (kind === 'meeting_cancelled' || kind === 'series_cancelled') {
    const list = dateList(dates, zone, true)
    const subject = series
      ? `Cancelled: ${title} (${dates.length} ${dates.length === 1 ? 'meeting' : 'meetings'})`
      : `Cancelled: ${title} · ${first ? formatRange(first, zone) : ''}`
    return {
      subject,
      text: [`${organizer} cancelled ${title}.`, '', list.text, '', `Where: ${where}`, '', MEETING_FOOTER.join('\n')].join('\n'),
      html: layout({
        title: subject,
        preheader: `${organizer} cancelled ${title}.`,
        label: 'Meeting cancelled',
        heading: `${title} is cancelled`,
        site,
        body:
          para(`<strong style="color:#111827">${e(organizer)}</strong> cancelled ${series && dates.length > 1 ? 'these meetings' : 'this meeting'}.`) +
          panel(list.html) +
          details([['Where', e(where)]]) +
          button('Open meetings', link),
        footer: MEETING_FOOTER,
      }),
    }
  }

  const changed = kind === 'meeting_changed' || kind === 'series_changed'
  const old = (data.old ?? {}) as Record<string, unknown>
  const oldRange =
    kind === 'meeting_changed' && str(old.old_starts_at) && str(old.old_ends_at)
      ? { starts_at: str(old.old_starts_at), ends_at: str(old.old_ends_at) }
      : null
  const movedFrom = oldRange && first && formatRange(oldRange, zone) !== formatRange(first, zone) ? formatRange(oldRange, zone) : null
  const renamedFrom = kind === 'meeting_changed' && str(old.old_title) && oneLine(str(old.old_title)) !== title ? oneLine(str(old.old_title)) : null

  const list = dateList(dates, zone)
  const when = series ? list.html : e(first ? formatRange(first, zone) : '')
  const whenText = series ? `\n${list.text}` : first ? formatRange(first, zone) : ''

  const subject = changed
    ? `Updated: ${title}${!series && first ? ` · ${formatRange(first, zone)}` : ' (repeating)'}`
    : series
      ? `Invitation: ${title} (repeating, ${dates.length} meetings)`
      : `Invitation: ${title} · ${first ? formatRange(first, zone) : ''}`
  const heading = changed ? `${title} has changed` : `${organizer} invited you to ${title}`
  const intro = changed
    ? `<strong style="color:#111827">${e(organizer)}</strong> changed ${series ? 'this repeating meeting. Its upcoming times' : 'this meeting. The details'} are below.`
    : `<strong style="color:#111827">${e(organizer)}</strong> scheduled ${series ? `a repeating meeting (${dates.length} meetings)` : 'a meeting'} and you’re invited. Join it from Calsko at the time.`

  const rows: [string, string][] = []
  if (renamedFrom) rows.push(['Was called', `<span style="text-decoration:line-through;color:#6b7280">${e(renamedFrom)}</span>`])
  if (movedFrom) rows.push(['Was', `<span style="text-decoration:line-through;color:#6b7280">${e(movedFrom)}</span>`])
  rows.push([movedFrom ? 'Now' : 'When', when])
  rows.push(['Where', e(where)])

  const calendarLinks =
    !series && first
      ? `<p style="margin:12px 0 0;font-size:13px;color:#6b7280">Add to calendar: <a href="${e(googleUrl(title, first, link))}" style="color:#111827">Google</a> · <a href="${e(outlookUrl(title, first, link))}" style="color:#111827">Outlook</a> · <a href="${e(link)}" style="color:#111827">.ics on the meeting page</a></p>`
      : `<p style="margin:12px 0 0;font-size:13px;color:#6b7280">Add every meeting to your calendar with the .ics file on the <a href="${e(link)}" style="color:#111827">meeting page</a>.</p>`

  return {
    subject,
    text: [
      changed ? `${organizer} changed ${title}.` : `${organizer} invited you to ${title}.`,
      '',
      renamedFrom ? `Was called: ${renamedFrom}` : '',
      movedFrom ? `Was: ${movedFrom}` : '',
      `${movedFrom ? 'Now' : 'When'}: ${whenText}`,
      `Where: ${where}`,
      description ? `\n${description.trim()}` : '',
      '',
      `Open the meeting: ${link}`,
      '',
      MEETING_FOOTER.join('\n'),
    ]
      .filter((line, i, all) => line !== '' || all[i - 1] !== '')
      .join('\n'),
    html: layout({
      title: subject,
      preheader: changed ? `New details for ${title}.` : `${organizer} invited you. ${first ? formatRange(first, zone) : ''}`,
      label: changed ? 'Meeting updated' : 'Meeting invitation',
      heading,
      site,
      body:
        para(intro) +
        details(rows) +
        (description ? panel(paragraphs(description)) : '') +
        button('View meeting', link) +
        calendarLinks,
      footer: MEETING_FOOTER,
    }),
  }
}

function reminder(message: Message, site: string): Rendered {
  const { data } = message
  const title = oneLine(str(data.title)) || 'Note'
  const notes = str(data.notes)
  const issue = oneLine(str(data.issue))
  const link = `${site}${str(data.path)}`
  const plain: [string, string][] = [['Group', oneLine(str(data.team_name))]]
  if (str(data.workspace_name)) plain.push(['In', oneLine(str(data.workspace_name))])
  if (issue) plain.push(['Issue', issue])
  const rows = plain.map(([k, v]): [string, string] => [k, e(v)])
  const footer = [
    'You get this because you set a time on this note in Calsko.',
    'Turn note emails off in Calsko: click your name → Email.',
  ]
  const subject = `Reminder: ${title}`
  return {
    subject,
    text: [subject, '', notes.trim(), '', ...plain.map(([k, v]) => `${k}: ${v}`), '', `Open: ${link}`, '', footer.join('\n')]
      .filter((line, i, all) => line !== '' || all[i - 1] !== '')
      .join('\n'),
    html: layout({
      title: subject,
      preheader: notes ? oneLine(notes).slice(0, 120) : 'Your note is due.',
      label: 'Note reminder',
      heading: title,
      site,
      body: (notes ? panel(paragraphs(notes)) : '') + details(rows) + button(issue ? 'Open issue' : 'Open note', link),
      footer,
    }),
  }
}

const FEEDBACK_KIND: Record<string, string> = { problem: 'Problem', idea: 'Idea', other: 'Feedback' }

function feedback(message: Message, site: string): Rendered {
  const { data } = message
  const kind = FEEDBACK_KIND[str(data.kind)] ?? 'Feedback'
  const text = str(data.message)
  const sender = oneLine(str(data.sender_name)) || 'Someone'
  const email = str(data.sender_email)
  const context = (data.context ?? {}) as Record<string, unknown>
  const browser = Object.entries(context)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' · ')
  const rows: [string, string][] = [['From', e(email ? `${sender} <${email}>` : sender)]]
  if (str(data.team_name)) rows.push(['Group', e(oneLine(str(data.team_name)))])
  if (str(data.page)) rows.push(['Page', e(str(data.page))])
  if (browser) rows.push(['Browser', `<span style="color:#6b7280">${e(browser)}</span>`])
  const subject = `${kind} from ${sender}: ${oneLine(text).slice(0, 60)}${oneLine(text).length > 60 ? '…' : ''}`
  const footer = ['Sent to the Calsko support address. Reply to answer the sender directly.']
  return {
    subject,
    text: [`${kind} from ${sender}${email ? ` <${email}>` : ''}`, '', text.trim(), '', str(data.team_name) ? `Group: ${str(data.team_name)}` : '', str(data.page) ? `Page: ${str(data.page)}` : '', browser ? `Browser: ${browser}` : '', '', `All feedback: ${site}/admin/feedback`]
      .filter((line, i, all) => line !== '' || all[i - 1] !== '')
      .join('\n'),
    html: layout({
      title: subject,
      preheader: oneLine(text).slice(0, 120),
      label: `New feedback · ${kind}`,
      heading: `${sender} sent ${kind === 'Feedback' ? 'feedback' : `a${kind === 'Idea' ? 'n idea' : ' problem'}`}`,
      site,
      body: panel(paragraphs(text)) + details(rows) + button('Open in the admin console', `${site}/admin/feedback`),
      footer,
    }),
  }
}

type ChatLine = { author: string; content: string; created_at: string; reply: boolean }

function chat(message: Message, site: string): Rendered {
  const { data, time_zone: zone } = message
  const name = oneLine(str(data.conversation_name)) || 'a conversation'
  const unread = typeof data.unread === 'number' ? data.unread : Number(data.unread) || 1
  const mentioned = data.mentioned === true
  const lines = (Array.isArray(data.messages) ? data.messages : []) as ChatLine[]
  const authors = [...new Set(lines.map((line) => oneLine(line.author)))]
  const from = authors.length === 0 ? 'Someone' : authors.length <= 2 ? authors.join(' and ') : `${authors[0]} and ${authors.length - 1} others`
  const where = data.conversation_kind === 'dm' ? '' : ` in ${name}`
  const link = `${site}${str(data.path)}`
  const time = new Intl.DateTimeFormat('en-US', { timeZone: zone ?? 'UTC', hour: 'numeric', minute: '2-digit', timeZoneName: zone ? undefined : 'short' })

  const subject = mentioned
    ? `${from} mentioned you${where}`
    : `${unread === 1 ? 'New message' : `${unread} new messages`} from ${from}${where}`
  const heading = mentioned ? `You were mentioned${where}` : `${unread === 1 ? 'A new message' : `${unread} new messages`}${where}`
  const shown = lines
    .map(
      (line) =>
        `<p style="margin:0 0 12px"><strong style="color:#111827">${e(oneLine(line.author))}</strong> <span style="font-size:12px;color:#9ca3af">${e(time.format(new Date(line.created_at)))}${line.reply ? ' · in a thread' : ''}</span><br>${paragraphs(line.content || '(attachment)')}</p>`,
    )
    .join('')
  const more = unread - lines.length
  const footer = [
    'You get this because these were still unread after 30 minutes. Reading them in Calsko stops the email.',
    'Turn chat emails off in Calsko: click your name → Email. Muted conversations never email.',
  ]
  return {
    subject,
    text: [
      heading,
      '',
      ...lines.map((line) => `${oneLine(line.author)}: ${oneLine(line.content || '(attachment)')}`),
      more > 0 ? `…and ${more} more` : '',
      '',
      `Open the conversation: ${link}`,
      '',
      footer.join('\n'),
    ]
      .filter((line, i, all) => line !== '' || all[i - 1] !== '')
      .join('\n'),
    html: layout({
      title: subject,
      preheader: lines.length ? `${oneLine(lines[lines.length - 1].author)}: ${oneLine(lines[lines.length - 1].content).slice(0, 100)}` : subject,
      label: `Unread in ${oneLine(str(data.team_name))}`,
      heading,
      site,
      body:
        panel(shown + (more > 0 ? `<span style="color:#6b7280">…and ${more} more</span>` : '')) + button('Open the conversation', link),
      footer,
    }),
  }
}

export function render(message: Message, site: string): Rendered {
  switch (message.kind) {
    case 'chat':
      return chat(message, site)
    case 'reminder':
      return reminder(message, site)
    case 'feedback':
      return feedback(message, site)
    default:
      return meeting(message, site)
  }
}
