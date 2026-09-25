// jaas-token: a short-lived JaaS (8x8 Jitsi as a Service) JWT for one live
// session. The JaaS private key never leaves this function.
//
// POST { sessionId } with the user's Supabase access token →
//   200 { token, appId, roomName }
//   401 not signed in · 404 session not visible (RLS) · 403 outside the join window
//   503 JaaS isn't configured (secrets missing)
//
// Secrets (set with `supabase secrets set`, never in the repo):
//   JAAS_APP_ID       vpaas-magic-cookie-…
//   JAAS_KEY_ID       vpaas-magic-cookie-…/abc123 (the API key's ID)
//   JAAS_PRIVATE_KEY  the matching PKCS#8 PEM private key
//
// Access is decided by the database: the session is read under the caller's
// RLS, and public.can_moderate_live_session() says whether they moderate
// (group owners/admins, or the workspace's lead).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { importPKCS8, SignJWT } from 'npm:jose@6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Anyone may join from 15 minutes before the start; moderators any time before the end. */
const EARLY_JOIN_MS = 15 * 60_000
/** The room stays joinable for an hour after the scheduled end. */
const LATE_JOIN_MS = 60 * 60_000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const appId = Deno.env.get('JAAS_APP_ID')
  const keyId = Deno.env.get('JAAS_KEY_ID')
  // `supabase secrets set` may store the PEM's newlines as literal "\n".
  const privateKey = Deno.env.get('JAAS_PRIVATE_KEY')?.replace(/\\n/g, '\n')
  if (!appId || !keyId || !privateKey) return json({ error: 'not_configured' }, 503)

  const authorization = req.headers.get('Authorization') ?? ''
  const accessToken = authorization.replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'unauthorized' }, 401)

  let sessionId: unknown
  try {
    sessionId = (await req.json())?.sessionId
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return json({ error: 'bad_request' }, 400)
  }

  // Every query below runs as the caller, under RLS.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)
  const user = userData.user

  const [{ data: session, error: sessionError }, { data: moderator, error: modError }, { data: profile }] =
    await Promise.all([
      supabase.from('live_sessions').select('id, room_name, starts_at, ends_at').eq('id', sessionId).maybeSingle(),
      supabase.rpc('can_moderate_live_session', { p_session_id: sessionId }),
      supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).maybeSingle(),
    ])
  if (sessionError || modError) {
    console.error('[jaas-token] lookup failed', sessionError ?? modError)
    return json({ error: 'server_error' }, 500)
  }
  if (!session) return json({ error: 'not_found' }, 404)

  const now = Date.now()
  const startsAt = Date.parse(session.starts_at)
  const endsAt = Date.parse(session.ends_at)
  if (now > endsAt + LATE_JOIN_MS) return json({ error: 'ended' }, 403)
  if (!moderator && now < startsAt - EARLY_JOIN_MS) return json({ error: 'too_early' }, 403)

  const meta = user.user_metadata ?? {}
  const name = profile?.display_name || meta.full_name || meta.name || user.email?.split('@')[0] || 'Guest'
  const avatar = profile?.avatar_url || meta.avatar_url || meta.picture || ''

  let token: string
  try {
    const key = await importPKCS8(privateKey, 'RS256')
    const nowSec = Math.floor(now / 1000)
    token = await new SignJWT({
      room: session.room_name,
      context: {
        user: {
          id: user.id,
          name,
          avatar,
          email: user.email ?? '',
          moderator: moderator ? 'true' : 'false',
        },
        features: {
          livestreaming: 'false',
          recording: 'false',
          transcription: 'false',
          'outbound-call': 'false',
          'sip-outbound-call': 'false',
        },
      },
    })
      .setProtectedHeader({ alg: 'RS256', kid: keyId, typ: 'JWT' })
      .setAudience('jitsi')
      .setIssuer('chat')
      .setSubject(appId)
      .setNotBefore(nowSec - 10)
      // Long enough for the whole call, but never valid long after it.
      .setExpirationTime(Math.max(nowSec + 2 * 3600, Math.floor((endsAt + LATE_JOIN_MS) / 1000)))
      .sign(key)
  } catch (error) {
    console.error('[jaas-token] signing failed (check JAAS_PRIVATE_KEY)', error)
    return json({ error: 'not_configured' }, 503)
  }

  return json({ token, appId, roomName: session.room_name })
})
