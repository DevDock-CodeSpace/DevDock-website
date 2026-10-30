// send-emails: drains public.email_outbox. Called by pg_cron (private.kick_email_worker, through
// pg_net) only when something is due; never by a browser.
//
// POST with header x-worker-secret →
//   200 { sent, failed }  ·  401 wrong secret  ·  503 not configured
//
// Secrets (set with `supabase secrets set`, never in the repo):
//   RESEND_API_KEY        a Resend key with sending access for calsko.com (shared with invite-email)
//   EMAIL_WORKER_SECRET   the same random string as the Vault secret 'email_worker_secret'
//   EMAIL_FROM            optional, default "Calsko <notifications@calsko.com>"
//   EMAIL_REPLY_TO        optional, default "support@calsko.com"
//   FEEDBACK_EMAIL_TO     optional, default "support@calsko.com" (forwarded by ImprovMX to the people who read it)
//   APP_URL               optional, default https://www.calsko.com (where links point)
//
// The database decides who gets what (public.email_claim_batch reads the audience, settings and
// addresses at send time); this function only writes and sends.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { type Email, LIVE_ORIGIN, sendBatch } from '../_shared/email.ts'
import { type Message, render } from './templates.ts'

/** Resend's batch limit. A claim never returns more outbox rows than this many emails' worth in practice. */
const MAX_PER_REQUEST = 100

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const secret = Deno.env.get('EMAIL_WORKER_SECRET')
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!secret || !apiKey) return json({ error: 'not_configured' }, 503)
  if (!sameSecret(req.headers.get('x-worker-secret') ?? '', secret)) return json({ error: 'unauthorized' }, 401)

  const from = Deno.env.get('EMAIL_FROM') || 'Calsko <notifications@calsko.com>'
  const replyTo = Deno.env.get('EMAIL_REPLY_TO') || 'support@calsko.com'
  const feedbackTo = Deno.env.get('FEEDBACK_EMAIL_TO') || 'support@calsko.com'
  const site = (Deno.env.get('APP_URL') || LIVE_ORIGIN).replace(/\/$/, '')

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Drops what was queued for a sub-feature that has since been switched off (feature flags).
  const { error: prepareError } = await admin.rpc('email_prepare_batch')
  if (prepareError) console.error('[send-emails] prepare failed', prepareError)

  let sent = 0
  let failed = 0
  // A few rounds per call, so a burst (a series invite to a whole class) doesn't wait a minute per batch.
  for (let round = 0; round < 5; round++) {
    const { data, error } = await admin.rpc('email_claim_batch', { p_limit: 20 })
    if (error) {
      console.error('[send-emails] claim failed', error)
      return json({ error: 'server_error' }, 500)
    }
    const messages = (data ?? []) as Message[]
    if (messages.length === 0) break

    // Every outbox row is reported once: ok when all its emails were accepted.
    const byOutbox = new Map<string, { emails: Email[]; error?: string }>()
    for (const message of messages) {
      const entry = byOutbox.get(message.outbox_id) ?? { emails: [] }
      byOutbox.set(message.outbox_id, entry)
      try {
        const { subject, text, html } = render(message, site)
        const to = message.kind === 'feedback' ? feedbackTo : message.to_email
        // Test accounts (dev-admin@devdock.test): .test never receives mail, and bounces hurt the domain.
        if (!to || /\.test$/i.test(to)) continue
        entry.emails.push({
          from,
          to: [to],
          reply_to: message.reply_to ?? replyTo,
          subject,
          text,
          html,
        })
      } catch (renderError) {
        console.error('[send-emails] render failed', message.outbox_id, renderError)
        entry.error = 'render_failed'
      }
    }

    const results: { id: string; ok: boolean; recipients?: number; error?: string }[] = []
    const ready = [...byOutbox].filter(([, entry]) => !entry.error)
    for (const [id, entry] of byOutbox) if (entry.error) results.push({ id, ok: false, error: entry.error })

    // Pack whole outbox rows into requests of at most 100 emails.
    let chunk: [string, Email[]][] = []
    let size = 0
    const flush = async () => {
      if (chunk.length === 0) return
      try {
        await sendBatch(apiKey, chunk.flatMap(([, emails]) => emails))
        for (const [id, emails] of chunk) results.push({ id, ok: true, recipients: emails.length })
        sent += size
      } catch (sendError) {
        console.error('[send-emails] Resend refused', sendError)
        for (const [id] of chunk) results.push({ id, ok: false, error: String(sendError) })
        failed += size
      }
      chunk = []
      size = 0
    }
    for (const [id, entry] of ready) {
      if (size + entry.emails.length > MAX_PER_REQUEST) await flush()
      chunk.push([id, entry.emails])
      size += entry.emails.length
    }
    await flush()

    const { error: finishError } = await admin.rpc('email_finish_batch', { p_results: results })
    if (finishError) {
      console.error('[send-emails] finish failed', finishError)
      return json({ error: 'server_error' }, 500)
    }
  }

  return json({ sent, failed })
})
