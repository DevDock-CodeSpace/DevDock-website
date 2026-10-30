// invite-email: email group invites through Resend. Each address gets its own
// single-use invite code (7 days) and a link that opens the join page with it.
//
// POST { teamId, emails: string[] } with the user's Supabase access token →
//   200 { sent: number }
//   400 bad addresses · 401 not signed in · 403 not an owner/admin of the group
//   502 Resend refused (the codes it would have sent are deleted again)
//   503 Resend isn't configured (secret missing)
//
// Secrets (set with `supabase secrets set`, never in the repo):
//   RESEND_API_KEY  a Resend key with sending access for calsko.com
//   INVITE_FROM     optional sender, default "Calsko <invites@calsko.com>"
//   EMAIL_REPLY_TO  optional, default "support@calsko.com": where replies go
//                   (calsko.com receives no mail itself; that address forwards)
//
// Access is decided by the database: the group is read and the codes are
// created as the caller, under RLS (only owners/admins may insert invites).
// Addresses are only passed to Resend; nothing in Calsko stores them.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_EMAILS = 20
const EXPIRES_MS = 7 * 86_400_000
const LIVE_ORIGIN = 'https://www.calsko.com'
/** Where the link in the email may point: the live site, a Vercel preview, or a local dev server. */
const ALLOWED_ORIGIN = /^(https:\/\/(www\.)?calsko\.com|https:\/\/[a-z0-9-]+\.vercel\.app|http:\/\/localhost:\d+)$/
const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** One line of a plain-text email can't carry a newline someone put in a name. */
function oneLine(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

const TEAM_TYPES: Record<string, string> = { learning: 'learning', development: 'development', general: '' }

/** Email-safe HTML: tables, inline styles, a PNG logo already served by the live site (Gmail shows no SVG). */
function inviteEmail(input: {
  from: string
  replyTo: string
  to: string
  inviter: string
  group: string
  groupType: string
  code: string
  link: string
}) {
  const inviter = oneLine(input.inviter)
  const group = oneLine(input.group)
  const site = new URL(input.link).origin
  const kind = TEAM_TYPES[input.groupType] ? `${TEAM_TYPES[input.groupType]} group` : 'group'
  const subject = `${inviter} invited you to ${group} on Calsko`
  const preheader = `Join ${group} on Calsko. Your invite code: ${input.code}`
  const text = [
    `You're invited to join ${group}`,
    '',
    `${inviter} invited you to ${group}, a ${kind} on Calsko, where your group shares chat, files, meetings and work.`,
    '',
    `Accept the invite: ${input.link}`,
    '',
    'What happens next:',
    '1. Sign in with Google or Microsoft.',
    `2. Press "Join group". The code is filled in for you.`,
    `3. You're in. You'll see what's shared with ${group}; courses and projects that aren't are shared with you separately.`,
    '',
    `Or sign in at ${site} and enter this invite code: ${input.code}`,
    '',
    'The code works once and expires in 7 days. If you weren’t expecting this, you can ignore this email.',
    '',
    `Calsko · ${site}`,
  ].join('\n')

  const e = escapeHtml
  const step = (n: number, body: string) => `
            <tr>
              <td width="28" valign="top" style="padding:0 0 12px">
                <div style="width:22px;height:22px;border-radius:11px;background:#f3f4f6;color:#111827;font-size:12px;font-weight:600;line-height:22px;text-align:center">${n}</div>
              </td>
              <td valign="top" style="padding:2px 0 12px;font-size:14px;line-height:20px;color:#374151">${body}</td>
            </tr>`

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${e(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7">
    <tr>
      <td align="center" style="padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
          <tr>
            <td style="padding:0 4px 20px">
              <a href="${e(site)}" style="text-decoration:none;color:#111827">
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
                  <td style="padding:32px 32px 8px">
                    <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:#6b7280">Group invite</p>
                    <h1 style="margin:0 0 12px;font-size:24px;line-height:30px;font-weight:700;letter-spacing:-0.4px;color:#111827">You’re invited to join ${e(group)}</h1>
                    <p style="margin:0 0 24px;font-size:15px;line-height:23px;color:#374151"><strong style="color:#111827">${e(inviter)}</strong> invited you to <strong style="color:#111827">${e(group)}</strong>, a ${e(kind)} on Calsko, where your group shares chat, files, meetings and work.</p>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-radius:8px;background:#111827">
                          <a href="${e(input.link)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">Accept invite</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 32px 12px">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#111827">What happens next</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${step(1, 'Sign in with Google or Microsoft.')}${step(2, 'Press <strong>Join group</strong>. The code is filled in for you.')}${step(3, `You’re in. You’ll see what’s shared with ${e(group)}; courses and projects that aren’t are shared with you separately.`)}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 32px 32px">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border:1px solid #eceef2;border-radius:8px">
                      <tr>
                        <td style="padding:14px 16px">
                          <p style="margin:0 0 4px;font-size:12px;color:#6b7280">Button not working? Sign in at <a href="${e(site)}" style="color:#111827;text-decoration:underline">${e(site.replace(/^https?:\/\//, ''))}</a> and enter this code:</p>
                          <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:20px;font-weight:600;letter-spacing:3px;color:#111827">${e(input.code)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;font-size:12px;line-height:18px;color:#9ca3af;text-align:center">
              The code works once and expires in 7 days.<br>
              If you weren’t expecting this invite, you can ignore this email.<br><br>
              Sent by <a href="${e(site)}" style="color:#6b7280;text-decoration:none">Calsko</a> on behalf of ${e(inviter)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  return { from: input.from, to: [input.to], reply_to: input.replyTo, subject, text, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return json({ error: 'not_configured' }, 503)
  const from = Deno.env.get('INVITE_FROM') || 'Calsko <invites@calsko.com>'
  const replyTo = Deno.env.get('EMAIL_REPLY_TO') || 'support@calsko.com'

  const accessToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'unauthorized' }, 401)

  let body: { teamId?: unknown; emails?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const { teamId, emails } = body
  if (typeof teamId !== 'string' || !/^[0-9a-f-]{36}$/i.test(teamId) || !Array.isArray(emails)) {
    return json({ error: 'bad_request' }, 400)
  }
  const addresses = [
    ...new Set(emails.map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))),
  ]
  if (addresses.length === 0 || addresses.length > MAX_EMAILS) return json({ error: 'bad_request' }, 400)
  if (addresses.some((a) => a.length > 254 || !EMAIL.test(a))) return json({ error: 'bad_email' }, 400)

  // Every query below runs as the caller, under RLS.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)
  const user = userData.user

  const [{ data: team, error: teamError }, { data: profile }] = await Promise.all([
    supabase.from('teams').select('id, name, type').eq('id', teamId).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ])
  if (teamError) {
    console.error('[invite-email] group lookup failed', teamError)
    return json({ error: 'server_error' }, 500)
  }
  if (!team) return json({ error: 'forbidden' }, 403)

  const expiresAt = new Date(Date.now() + EXPIRES_MS).toISOString()
  const { data: invites, error: inviteError } = await supabase
    .from('team_invites')
    .insert(addresses.map(() => ({ team_id: team.id, expires_at: expiresAt, max_uses: 1 })))
    .select('id, code')
  if (inviteError || !invites || invites.length !== addresses.length) {
    // RLS: only group owners and admins may create invites.
    if (inviteError?.code === '42501') return json({ error: 'forbidden' }, 403)
    console.error('[invite-email] creating codes failed', inviteError)
    return json({ error: 'server_error' }, 500)
  }

  const origin = req.headers.get('Origin') ?? ''
  const base = ALLOWED_ORIGIN.test(origin) ? origin : LIVE_ORIGIN
  const meta = user.user_metadata ?? {}
  const inviter = profile?.display_name || meta.full_name || meta.name || 'Someone'

  const messages = addresses.map((to, i) =>
    inviteEmail({
      from,
      replyTo,
      to,
      inviter,
      group: team.name,
      groupType: team.type,
      code: invites[i].code,
      link: `${base}/onboarding?code=${encodeURIComponent(invites[i].code)}`,
    }),
  )

  const response = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  })
  if (!response.ok) {
    console.error('[invite-email] Resend refused', response.status, await response.text().catch(() => ''))
    // Nothing was sent, so the codes would only clutter the list.
    await supabase.from('team_invites').delete().in('id', invites.map((invite) => invite.id))
    return json({ error: response.status === 401 || response.status === 403 ? 'not_configured' : 'send_failed' }, 502)
  }

  return json({ sent: addresses.length })
})
