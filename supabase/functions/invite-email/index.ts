// invite-email: email group invites through Resend. Each address gets its own
// single-use invite code (7 days) and a link that opens the join page with it.
//
// POST { teamId, emails: string[] } with the user's Supabase access token →
//   200 { sent: number }
//   400 bad addresses · 401 not signed in · 403 not an owner/admin of the group, or invite emails are off (flag)
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
import { button, type Email, escapeHtml, layout, LIVE_ORIGIN, oneLine, panel, para, ResendError, sendBatch } from '../_shared/email.ts'
import { startErrorReporting } from '../_shared/report-errors.ts'

startErrorReporting('invite-email')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_EMAILS = 20
const EXPIRES_MS = 7 * 86_400_000
/** Where the link in the email may point: the live site, a Vercel preview, or a local dev server. */
const ALLOWED_ORIGIN = /^(https:\/\/(www\.)?calsko\.com|https:\/\/[a-z0-9-]+\.vercel\.app|http:\/\/localhost:\d+)$/
const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const TEAM_TYPES: Record<string, string> = { learning: 'learning', development: 'development', general: '' }

function inviteEmail(input: {
  from: string
  replyTo: string
  to: string
  inviter: string
  group: string
  groupType: string
  code: string
  link: string
}): Email {
  const inviter = oneLine(input.inviter)
  const group = oneLine(input.group)
  const site = new URL(input.link).origin
  const kind = TEAM_TYPES[input.groupType] ? `${TEAM_TYPES[input.groupType]} group` : 'group'
  const subject = `${inviter} invited you to ${group} on Calsko`
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

  const html = layout({
    title: subject,
    preheader: `Join ${group} on Calsko. Your invite code: ${input.code}`,
    label: 'Group invite',
    heading: `You’re invited to join ${group}`,
    site,
    body:
      para(`<strong style="color:#111827">${e(inviter)}</strong> invited you to <strong style="color:#111827">${e(group)}</strong>, a ${e(kind)} on Calsko, where your group shares chat, files, meetings and work.`, 'margin-bottom:24px') +
      button('Accept invite', input.link) +
      `<p style="margin:24px 0 12px;font-size:13px;font-weight:600;color:#111827">What happens next</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px">${step(1, 'Sign in with Google or Microsoft.')}${step(2, 'Press <strong>Join group</strong>. The code is filled in for you.')}${step(3, `You’re in. You’ll see what’s shared with ${e(group)}; courses and projects that aren’t are shared with you separately.`)}
</table>` +
      panel(`<span style="font-size:12px;color:#6b7280">Button not working? Sign in at <a href="${e(site)}" style="color:#111827;text-decoration:underline">${e(site.replace(/^https?:\/\//, ''))}</a> and enter this code:</span><br><span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:20px;font-weight:600;letter-spacing:3px;color:#111827">${e(input.code)}</span>`),
    footer: [
      'The code works once and expires in 7 days.',
      'If you weren’t expecting this invite, you can ignore this email.',
      `Sent by Calsko on behalf of ${inviter}.`,
    ],
  })
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
    supabase.from('teams').select('id, name, type, enabled_features').eq('id', teamId).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ])
  if (teamError) {
    console.error('[invite-email] group lookup failed', teamError)
    return json({ error: 'server_error' }, 500)
  }
  if (!team) return json({ error: 'forbidden' }, 403)
  // Feature flags: email → email_invites (enabled_features already applies the parent).
  if (!(team.enabled_features as string[] | null)?.includes('email_invites')) return json({ error: 'disabled' }, 403)

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

  try {
    await sendBatch(apiKey, messages)
  } catch (sendError) {
    console.error('[invite-email] Resend refused', sendError)
    // Nothing was sent, so the codes would only clutter the list.
    await supabase.from('team_invites').delete().in('id', invites.map((invite) => invite.id))
    const status = sendError instanceof ResendError ? sendError.status : 0
    return json({ error: status === 401 || status === 403 ? 'not_configured' : 'send_failed' }, 502)
  }

  return json({ sent: addresses.length })
})
