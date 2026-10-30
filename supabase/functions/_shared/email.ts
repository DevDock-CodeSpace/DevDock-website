// The Calsko email look, shared by invite-email and send-emails: one card with the logo above it,
// tables and inline styles only (what Gmail and Outlook render), black accents, a PNG logo served by
// the live site (Gmail shows no SVG). Everything put into HTML goes through escapeHtml().

export const LIVE_ORIGIN = 'https://www.calsko.com'

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** A plain-text line can't carry a newline someone put in a name. */
export function oneLine(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

/** Text with its line breaks kept, for notes, descriptions and feedback. */
export function paragraphs(text: string) {
  return escapeHtml(text.trim()).replace(/\r?\n/g, '<br>')
}

export function button(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px">
  <tr><td style="border-radius:8px;background:#111827">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>
  </td></tr>
</table>`
}

/** A grey box, for codes, quotes and lists of times. `inner` is HTML. */
export function panel(inner: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f8f9fb;border:1px solid #eceef2;border-radius:8px">
  <tr><td style="padding:14px 16px;font-size:14px;line-height:21px;color:#374151">${inner}</td></tr>
</table>`
}

export function para(inner: string, style = '') {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:23px;color:#374151;${style}">${inner}</p>`
}

/** Small grey "Label  value" rows. Values are HTML. */
export function details(rows: [string, string][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${rows
    .map(
      ([label, value]) => `
  <tr>
    <td valign="top" style="padding:0 16px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap">${escapeHtml(label)}</td>
    <td valign="top" style="padding:0 0 6px;font-size:14px;line-height:20px;color:#111827">${value}</td>
  </tr>`,
    )
    .join('')}
</table>`
}

/**
 * The whole document. `label` is the small grey word above the heading ("Note reminder"), `body` the
 * card's HTML after the heading, `footer` plain text lines under the card.
 */
export function layout(input: { title: string; preheader: string; label: string; heading: string; body: string; footer: string[]; site: string }) {
  const e = escapeHtml
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${e(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(input.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7">
    <tr>
      <td align="center" style="padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
          <tr>
            <td style="padding:0 4px 20px">
              <a href="${e(input.site)}" style="text-decoration:none;color:#111827">
                <img src="${LIVE_ORIGIN}/favicon-192.png" width="32" height="32" alt="" style="vertical-align:middle;border:0;border-radius:8px">
                <span style="vertical-align:middle;margin-left:8px;font-size:20px;font-weight:700;letter-spacing:-0.3px">Calsko</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
              <div style="height:4px;background:#111827;font-size:0;line-height:0">&nbsp;</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:32px">
                    <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:#6b7280">${e(input.label)}</p>
                    <h1 style="margin:0 0 16px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.4px;color:#111827">${e(input.heading)}</h1>
                    ${input.body}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;font-size:12px;line-height:18px;color:#9ca3af;text-align:center">
              ${input.footer.map(e).join('<br>')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export type Email = { from: string; to: string[]; reply_to?: string; subject: string; text: string; html: string }

/** Sends up to 100 emails in one Resend request. Throws with Resend's answer when it refuses. */
export async function sendBatch(apiKey: string, emails: Email[]) {
  const response = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(emails),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new ResendError(response.status, detail)
  }
}

export class ResendError extends Error {
  constructor(readonly status: number, detail: string) {
    super(`Resend ${status}: ${detail.slice(0, 300)}`)
  }
}
