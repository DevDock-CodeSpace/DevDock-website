// Whether live updates (lib/realtime) are currently keeping a query fresh. When
// they are, coming back to the tab doesn't need to ask for the data again: every
// change already arrived as an event, and a dropped connection refetches
// everything when it returns. Kept apart from realtime.ts so the query client can
// read it without importing the Supabase client.

let connected = false

export function setLiveConnected(value: boolean) {
  connected = value
}

/** Roots whose tables are all in the `supabase_realtime` publication (see AFFECTS in realtime.ts). */
const LIVE_ROOTS = new Set(['teams', 'workspaces', 'documents', 'diagrams', 'issues', 'repos', 'learning', 'messaging'])

/** Queries under those roots that no event refreshes: tables left out of the publication, GitHub, signed URLs, search. */
const NOT_LIVE: ((key: readonly unknown[]) => boolean)[] = [
  (key) => key[0] === 'teams' && key.includes('invites'),
  (key) => key[0] === 'repos' && (key[1] === 'installations' || key[1] === 'github' || key[1] === 'branches'),
  (key) => key[0] === 'documents' && key[1] === 'image',
  (key) => key[0] === 'messaging' && key[1] === 'search',
]

export function keptLive(key: readonly unknown[]): boolean {
  return connected && typeof key[0] === 'string' && LIVE_ROOTS.has(key[0]) && !NOT_LIVE.some((test) => test(key))
}
