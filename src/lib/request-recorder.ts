// A measuring tool, off unless asked for: open any page with `?requests=1` (and
// `?requests=0` to stop). It counts every request the app makes to Supabase and
// says what caused it, so "how many requests does this page or button cost?" and
// "does this page make requests while nobody touches it?" have an answer.
// Loaded on demand from main.tsx, so it adds nothing for anyone else.
//
// It reads the browser's own resource timings rather than wrapping fetch: the
// Supabase client keeps the fetch it was created with, and timings also cover
// requests made before this file loaded. They carry no method or status.

/** How long after something the user did a request still counts as caused by it. */
const AFTER_LOAD_MS = 4000
const AFTER_ACTION_MS = 3000

type Cause = 'page load' | 'navigation' | 'tab focus' | 'idle' | `click: ${string}` | 'typing'
type Entry = { at: number; route: string; cause: Cause; path: string }
type Mark = { at: number; cause: Cause }

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** "/t/acme/w/<uuid>/issues/12" → "/t/:group/w/:id/issues/:n", so visits to different items add up. */
function routeOf(pathname: string) {
  return pathname
    .replace(UUID, ':id')
    .replace(/^\/t\/[^/]+/, '/t/:group')
    .replace(/\/\d+(?=\/|$)/g, '/:n')
}

/** "https://x.supabase.co/rest/v1/rpc/send_message?…" → "rpc/send_message". */
function pathOf(url: URL) {
  const path = url.pathname.replace(UUID, ':id')
  return path.replace(/^\/rest\/v1\//, '').replace(/^\/(auth|storage|functions|realtime)\/v1\//, '$1: ')
}

function labelOf(target: EventTarget | null) {
  const el = target instanceof Element ? target.closest('button, a, [role="menuitem"], [role="tab"], [role="option"], input, textarea, [contenteditable="true"]') : null
  if (!el) return 'the page'
  const text = (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
  return (text || el.tagName.toLowerCase()).slice(0, 40)
}

export function startRequestRecorder(supabaseUrl: string) {
  const host = new URL(supabaseUrl).host
  const entries: Entry[] = []
  // The most recent thing that could explain a request. Timings and events share performance.now().
  let last: Mark = { at: 0, cause: 'page load' }
  let route = routeOf(window.location.pathname)
  let since = performance.now()

  const mark = (cause: Cause) => {
    last = { at: performance.now(), cause }
  }
  const causeAt = (at: number): Cause => {
    const window_ = last.cause === 'page load' ? AFTER_LOAD_MS : AFTER_ACTION_MS
    return at - last.at <= window_ ? last.cause : 'idle'
  }

  // The router navigates through the History API; a new route starts a new bucket.
  const onRoute = () => {
    const next = routeOf(window.location.pathname)
    if (next === route) return
    route = next
    mark('navigation')
  }
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history)
    history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args)
      onRoute()
    }
  }
  window.addEventListener('popstate', onRoute)
  window.addEventListener('pointerdown', (event) => mark(`click: ${labelOf(event.target)}`), true)
  window.addEventListener('keydown', () => mark('typing'), true)
  window.addEventListener('focus', () => mark('tab focus'))
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) mark('tab focus')
  })

  const pill = document.createElement('button')
  pill.type = 'button'
  pill.title = 'Requests to Supabase since the last reset. Click for the breakdown (also copied); Shift-click to reset.'
  pill.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:2147483647;font:12px ui-monospace,monospace;padding:4px 8px;border-radius:6px;border:1px solid #8884;background:#111;color:#fff;cursor:pointer;opacity:.9'
  const draw = () => {
    const idle = entries.filter((entry) => entry.cause === 'idle').length
    pill.textContent = `${entries.length} requests · ${idle} idle`
    pill.style.borderColor = idle > 0 ? '#f55' : '#8884'
  }

  const add = (list: PerformanceEntryList) => {
    for (const item of list) {
      let url: URL
      try {
        url = new URL(item.name)
      } catch {
        continue
      }
      if (url.host !== host || url.pathname.startsWith('/realtime/')) continue
      entries.push({ at: item.startTime, route, cause: causeAt(item.startTime), path: pathOf(url) })
    }
    draw()
  }
  new PerformanceObserver((list) => add(list.getEntries())).observe({ type: 'resource', buffered: true })

  /** One row per route and cause, with the paths behind it. */
  const summary = () => {
    const rows = new Map<string, { route: string; cause: string; requests: number; paths: Map<string, number> }>()
    for (const entry of entries) {
      const key = `${entry.route}\n${entry.cause}`
      const row = rows.get(key) ?? { route: entry.route, cause: entry.cause, requests: 0, paths: new Map<string, number>() }
      row.requests += 1
      row.paths.set(entry.path, (row.paths.get(entry.path) ?? 0) + 1)
      rows.set(key, row)
    }
    return [...rows.values()].map((row) => ({
      route: row.route,
      cause: row.cause,
      requests: row.requests,
      paths: [...row.paths].sort((a, b) => b[1] - a[1]).map(([path, count]) => (count > 1 ? `${path} ×${count}` : path)).join(', '),
    }))
  }
  const report = () => {
    const rows = summary()
    const seconds = Math.round((performance.now() - since) / 1000)
    const text = [`Requests to Supabase over ${seconds}s: ${entries.length}`, '', '| Route | Cause | Requests | Paths |', '|---|---|---|---|', ...rows.map((row) => `| ${row.route} | ${row.cause} | ${row.requests} | ${row.paths} |`)].join('\n')
    console.table(rows)
    void navigator.clipboard?.writeText(text).catch(() => {})
    return text
  }
  const reset = () => {
    entries.length = 0
    since = performance.now()
    draw()
  }

  pill.addEventListener('click', (event) => {
    if (event.shiftKey) reset()
    else report()
  })
  // Its own clicks aren't the app's.
  pill.addEventListener('pointerdown', (event) => event.stopPropagation(), true)
  document.body.append(pill)
  draw()

  Object.assign(window, { devdockRequests: { report, reset, entries } })
  console.info('[requests] Recording. Click the counter (bottom left) for the breakdown, Shift-click to reset, or call devdockRequests.report().')
}
