// Error tracking with PostHog. Errors only: no pageviews, clicks, session replay, surveys or feature flags.
//
// This file is on the first load and stays tiny. posthog-js (about 110 KB gzipped, its own chunk) is downloaded
// only when the first error of the page happens: errors wait in a short queue until it has loaded, then go out,
// and later ones go straight to it. A session without errors costs nothing. Nothing is sent, and the library is
// never downloaded, unless POSTHOG_KEY is set and this is a production build.
//
// Reported: uncaught errors and promise rejections, route errors (RouteErrorPage), React root errors, and
// failed Supabase calls (`toDataError`). The person is identified by their user id only (no name or email).

import type { PostHog } from 'posthog-js'

type Pending = { error: unknown; properties: Record<string, unknown> }

const key = __POSTHOG_KEY__
const enabled = import.meta.env.PROD && Boolean(key)
const MAX_QUEUED = 20

let client: PostHog | null = null
let queue: Pending[] = []
let userId: string | null = null
let loading = false

/** Report an error. Safe to call anywhere, any number of times; does nothing when tracking is off. */
export function reportError(error: unknown, properties: Record<string, unknown> = {}): void {
  if (!enabled) return
  if (client) {
    client.captureException(error, properties)
    return
  }
  if (queue.length < MAX_QUEUED) queue.push({ error, properties })
  if (!loading) {
    loading = true
    // If the chunk can't load (offline), drop the queue and try again at the next error.
    loadPostHog().catch(() => {
      queue = []
      loading = false
    })
  }
}

/** Who errors belong to (the signed-in user's id, or null after sign-out). Called by `watchAuthIdentity`. */
export function setErrorUser(id: string | null): void {
  if (id === userId) return
  userId = id
  if (!client) return
  if (id) client.identify(id)
  else client.reset()
}

/** Called once from main.tsx: reports uncaught errors and promise rejections. */
export function startErrorTracking(): void {
  if (!enabled) return
  window.addEventListener('error', (event) => reportError(event.error ?? event.message, { source: 'window.onerror' }))
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason, { source: 'unhandledrejection' }))
}

async function loadPostHog(): Promise<void> {
  const { posthog } = await import('posthog-js')
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    // Errors only. Our own listeners above report uncaught errors, so PostHog's autocapture stays off.
    capture_exceptions: false,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    // No cookies or localStorage: the user id ties errors to a person.
    persistence: 'memory',
    person_profiles: 'identified_only',
    save_referrer: false,
  })
  // Tells DevDock Dev's errors from live's in one PostHog project.
  posthog.register({ supabase_project: supabaseProject() })
  if (userId) posthog.identify(userId)
  client = posthog
  const pending = queue
  queue = []
  for (const { error, properties } of pending) posthog.captureException(error, properties)
}

function supabaseProject(): string {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL ?? '').hostname.split('.')[0] || 'unknown'
  } catch {
    return 'unknown'
  }
}
