import type { Session, User } from '@supabase/supabase-js'
import { queryOptions } from '@tanstack/react-query'
import { supabase, supabasePublishableKey, supabaseUrl } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'
import { AuthFlowError } from './errors'
import { CALENDAR_SCOPE, clearCalendarToken, markCalendarConnecting } from './google-calendar'
import { rememberNextPath } from './redirect'

export type Profile = Tables<'profiles'>

export const AUTH_CALLBACK_PATH = '/auth/callback'

/**
 * The session from local storage, refreshed if expired. Good for deciding what
 * UI to show; it is not an authorization check. Postgres RLS is.
 */
export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('[auth] Failed to restore session', error)
    throw new AuthFlowError('session', { cause: error })
  }
  return data.session
}

export async function getCurrentUser(): Promise<User | null> {
  return (await getCurrentSession())?.user ?? null
}

/** Starts the Google OAuth redirect. Resolves just before the browser leaves the page. */
export async function signInWithGoogle(next: string): Promise<void> {
  await assertGoogleProviderEnabled()
  rememberNextPath(next)

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Fixed callback URL (must be in Supabase's Redirect URLs allow list);
      // the post-login destination travels in sessionStorage instead.
      redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) {
    console.error('[auth] signInWithOAuth failed', error)
    throw new AuthFlowError('oauth', { cause: error })
  }
}

/**
 * Signs in with Google again, this time also asking for Google Calendar
 * (calendar.events), and comes back to `next`. The callback keeps the Google
 * token for this tab (captureCalendarToken). Google shows the consent screen
 * the first time only; `email` pre-selects the signed-in account.
 */
export async function connectGoogleCalendar(next: string, email: string | undefined): Promise<void> {
  rememberNextPath(next)
  markCalendarConnecting()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
      scopes: CALENDAR_SCOPE,
      queryParams: { include_granted_scopes: 'true', ...(email ? { login_hint: email } : {}) },
    },
  })
  if (error) {
    clearCalendarToken()
    console.error('[auth] connectGoogleCalendar failed', error)
    throw new AuthFlowError('oauth', { cause: error })
  }
}

/** Signs out this browser only. Other devices keep their sessions. */
export async function signOut(): Promise<void> {
  clearCalendarToken()
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) {
    console.error('[auth] signOut failed', error)
    throw new Error('Couldn’t sign out. Check your connection and try again.', { cause: error })
  }
}

/**
 * The signed-in user's profile row, or null if the sign-up trigger hasn't
 * created it (shouldn't happen, but the UI falls back to Google account data).
 * RLS limits this query to the caller's own row regardless of `userId`.
 */
export async function getCurrentProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('[auth] Failed to load profile', error)
    throw new Error('Couldn’t load your profile.', { cause: error })
  }
  return data
}

export const profileQuery = (userId: string) =>
  queryOptions({
    queryKey: ['auth', 'profile', userId],
    queryFn: () => getCurrentProfile(userId),
    retry: 1,
  })

/**
 * If the Google provider is disabled, Supabase answers the OAuth redirect with a
 * raw JSON error page. Check the public auth settings first so we can show a
 * readable message instead.
 */
async function assertGoogleProviderEnabled(): Promise<void> {
  let settings: unknown
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabasePublishableKey },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    settings = await response.json()
  } catch (error) {
    console.error('[auth] Could not read auth settings', error)
    throw new AuthFlowError('unavailable', { cause: error })
  }

  const external =
    typeof settings === 'object' && settings !== null && 'external' in settings
      ? settings.external
      : null
  const googleEnabled =
    typeof external === 'object' && external !== null && 'google' in external && external.google === true
  if (!googleEnabled) throw new AuthFlowError('not-configured')
}
