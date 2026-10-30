import { supabase } from './supabase'

// Who is typing in the same text right now (Supabase Realtime Presence: kept in
// memory by the realtime server, nothing is stored). Editors here don't merge
// two people's edits, so the page warns instead (OthersTypingAlert).

type Meta = { userId?: unknown; name?: unknown; typing?: unknown; since?: unknown; presence_ref?: string }

/** Someone else typing: `since` is when they started (their clock), `tab` breaks an exact tie. */
export type Typist = { name: string; since: number; tab: string }
export type EditingRoom = { tab: string; setTyping: (on: boolean, since?: number) => void; leave: () => void }

/**
 * Joins the room for one piece of text (e.g. "doc:<id>"). `onOthers` gets
 * everyone else typing in it; the user's own other tabs count too.
 * Returns null while a previous visit to the same room is still closing.
 */
export function joinEditing(
  topic: string,
  me: { userId: string; name: () => string },
  onOthers: (others: Typist[]) => void,
): EditingRoom | null {
  // The same topic is still closing (left a moment ago): the caller tries again shortly.
  if (supabase.getChannels().some((c) => c.topic === `realtime:editing:${topic}`)) return null
  const tab = crypto.randomUUID()
  let typing = false
  let since = 0
  let live = false
  const channel = supabase.channel(`editing:${topic}`, { config: { presence: { key: tab } } })
  const send = () => {
    if (live) void channel.track({ userId: me.userId, name: me.name(), typing, since })
  }

  // Tracked from join/leave events: one entry per browser tab. (The client's own
  // presenceState() keeps entries that have left, so it can't be used for this.)
  const tabs = new Map<string, Meta>()
  const report = () => {
    const others: Typist[] = []
    for (const [key, meta] of tabs) {
      if (key === tab || meta.typing !== true) continue
      // Sent by other browsers: don't trust the shape.
      const name = typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim().slice(0, 80) : 'Someone'
      others.push({ name: meta.userId === me.userId ? 'Another tab of yours' : name, since: typeof meta.since === 'number' ? meta.since : 0, tab: key })
    }
    onOthers(others)
  }

  channel
    // A changed state arrives as a join (the new one) followed by a leave (the old one).
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      const latest = newPresences.at(-1) as Meta | undefined
      if (latest) tabs.set(key, latest)
      report()
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      const current = tabs.get(key)?.presence_ref
      if (leftPresences.some((left) => left.presence_ref === current)) tabs.delete(key)
      report()
    })
    .subscribe((status) => {
      live = status === 'SUBSCRIBED'
      send()
    })

  return {
    tab,
    setTyping(on, startedAt = Date.now()) {
      if (on === typing) return
      typing = on
      since = on ? startedAt : 0
      send()
    },
    leave() {
      void supabase.removeChannel(channel)
    },
  }
}

// --- who is online in a group, and their status (features/status) -----------------------------
// One channel per group, joined by the app shell; one presence entry per browser tab. Nothing is
// stored: the realtime server keeps it in memory and drops a tab's entry when its connection goes.

/** One tab's entry, as sent by other browsers (unchecked: features/status validates it). */
export type StatusTabMeta = { userId?: unknown; status?: unknown; presence_ref?: string }
export type GroupStatusRoom = { set: (meta: { userId: string; status: string }) => void; leave: () => void }

export function joinGroupStatus(teamId: string, onTabs: (tabs: Map<string, StatusTabMeta>) => void): GroupStatusRoom {
  const tab = crypto.randomUUID()
  let live = false
  let current: { userId: string; status: string } | null = null
  const channel = supabase.channel(`status:${teamId}`, { config: { presence: { key: tab } } })
  const send = () => {
    if (live && current) void channel.track(current)
  }
  const tabs = new Map<string, StatusTabMeta>()
  channel
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      const latest = newPresences.at(-1) as StatusTabMeta | undefined
      if (latest) tabs.set(key, latest)
      onTabs(new Map(tabs))
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      const ref = tabs.get(key)?.presence_ref
      if (leftPresences.some((left) => left.presence_ref === ref)) tabs.delete(key)
      onTabs(new Map(tabs))
    })
    .subscribe((state) => {
      live = state === 'SUBSCRIBED'
      send()
    })
  return {
    set(meta) {
      if (current && current.userId === meta.userId && current.status === meta.status) return
      current = meta
      send()
    },
    leave() {
      void supabase.removeChannel(channel)
    },
  }
}
