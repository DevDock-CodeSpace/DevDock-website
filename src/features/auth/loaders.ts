import type { User } from '@supabase/supabase-js'
import { redirect, type LoaderFunctionArgs } from 'react-router'
import { getCurrentSession } from './api'
import { captureCalendarToken, clearCalendarToken } from './google-calendar'
import { isLoginErrorCode, type LoginErrorCode } from './errors'
import { DEFAULT_AFTER_LOGIN, safeNextPath, takeNextPath } from './redirect'

function loginUrl(params: { next?: string; error?: LoginErrorCode }) {
  const search = new URLSearchParams()
  if (params.next && params.next !== DEFAULT_AFTER_LOGIN) search.set('next', params.next)
  if (params.error) search.set('error', params.error)
  const query = search.toString()
  return query ? `/login?${query}` : '/login'
}

/**
 * Route guard for loaders: returns the signed-in user or redirects to /login,
 * remembering the requested URL. UX only; the database enforces access via RLS.
 */
export async function requireUser(request: Request): Promise<User> {
  const url = new URL(request.url)
  const next = safeNextPath(url.pathname + url.search)
  let session
  try {
    session = await getCurrentSession()
  } catch {
    throw redirect(loginUrl({ next, error: 'session' }))
  }
  if (!session) throw redirect(loginUrl({ next }))
  return session.user
}

export async function loginLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const next = safeNextPath(url.searchParams.get('next'))
  // Already signed in: skip the login page. A restore failure just shows the page.
  const session = await getCurrentSession().catch(() => null)
  if (session) throw redirect(next)

  const error = url.searchParams.get('error')
  return { next, error: isLoginErrorCode(error) ? error : null }
}

/**
 * Google → Supabase → here. With PKCE, supabase-js exchanges the ?code= for a
 * session on startup (detectSessionInUrl); getSession() waits for that. This
 * loader only interprets the outcome and never renders a page of its own.
 */
export async function authCallbackLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const oauthError = url.searchParams.get('error') ?? hash.get('error')
  const next = takeNextPath()

  if (oauthError) {
    const description = url.searchParams.get('error_description') ?? hash.get('error_description')
    console.error('[auth] OAuth provider returned an error', oauthError, description)
    clearCalendarToken()
    throw redirect(loginUrl({ next, error: oauthError === 'access_denied' ? 'cancelled' : 'oauth' }))
  }

  let session
  try {
    session = await getCurrentSession()
  } catch {
    throw redirect(loginUrl({ next, error: 'callback' }))
  }
  if (!session) {
    console.error('[auth] Callback reached without a session (code missing, expired, or already used)')
    throw redirect(loginUrl({ next, error: 'callback' }))
  }
  captureCalendarToken(session)
  throw redirect(next)
}
