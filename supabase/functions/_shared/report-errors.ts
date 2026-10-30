// Server-side error tracking: every Edge Function's failures go to PostHog, next to the browser's
// (src/lib/error-tracking.ts). Each function calls startErrorReporting('<name>') once at the top.
//
// What is reported: everything the function logs with console.error (that is how every function already
// records a failure) and anything uncaught. The log line still goes to Supabase's logs as before. Reports
// are sent in the background (EdgeRuntime.waitUntil), so a response never waits for PostHog.
//
// Secret: POSTHOG_KEY (the public phc_ project key, the same one the site uses), set with
// `supabase secrets set` on the live project only. Without it nothing changes and nothing is sent.

import { PostHog } from 'npm:posthog-node@5.57.2/edge'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

const MAX_DETAIL = 1000

let client: PostHog | null = null
let functionName = ''
let reporting = false

export function startErrorReporting(name: string): void {
  const key = Deno.env.get('POSTHOG_KEY')?.trim()
  if (!key || client) return
  functionName = name
  client = new PostHog(key, { host: 'https://us.i.posthog.com', flushAt: 1, flushInterval: 0 })

  const log = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    log(...args)
    report(args, 'console.error')
  }
  globalThis.addEventListener('error', (event) => report([event.error ?? event.message], 'uncaught'))
  globalThis.addEventListener('unhandledrejection', (event) => report([event.reason], 'unhandledrejection'))
}

/**
 * The exception is the first Error among the arguments, else the log line's text. The text and any other
 * values (a Supabase or Resend error object) go along as `context` and `detail`, so the issue's title stays
 * the same from one occurrence to the next.
 */
function report(args: unknown[], source: string): void {
  // PostHog's own failures are logged too; don't report those (or anything logged while reporting).
  if (!client || reporting) return
  reporting = true
  try {
    const text = args.filter((a) => typeof a === 'string').join(' ')
    const errorArg = args.find((a) => a instanceof Error)
    const others = args.filter((a) => typeof a !== 'string' && a !== errorArg)
    const error = errorArg ?? new Error(text || 'Error')
    const properties = {
      function: functionName,
      source,
      context: errorArg ? text : undefined,
      detail: others.length ? describe(others) : undefined,
      supabase_project: supabaseProject(),
    }
    const sent = client.captureExceptionImmediate(error, undefined, properties).catch(() => {})
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(sent)
  } catch {
    // Reporting must never break the function.
  } finally {
    reporting = false
  }
}

function describe(values: unknown[]): string {
  const text = values
    .map((v) => {
      if (v instanceof Error) return `${v.name}: ${v.message}`
      try {
        return typeof v === 'object' ? JSON.stringify(v) : String(v)
      } catch {
        return String(v)
      }
    })
    .join(' ')
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}…` : text
}

function supabaseProject(): string {
  try {
    return new URL(Deno.env.get('SUPABASE_URL') ?? '').hostname.split('.')[0] || 'unknown'
  } catch {
    return 'unknown'
  }
}
