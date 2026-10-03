import { supabase } from './supabase'

// Who is typing in the same text right now (Supabase Realtime Presence: kept in
// memory by the realtime server, nothing is stored). Editors here don't merge
// two people's edits, so the page warns instead (OthersTypingAlert).

type Meta = { userId?: unknown; name?: unknown; typing?: unknown; presence_ref?: string }

export type EditingRoom = { setTyping: (on: boolean) => void; leave: () => void }

/**
 * Joins the room for one piece of text (e.g. "doc:<id>"). `onOthers` gets the
 * names of everyone else typing in it; the user's own other tabs count too.
 * Returns null while a previous visit to the same room is still closing.
 */
export function joinEditing(
  topic: string,
  me: { userId: string; name: () => string },
  onOthers: (names: string[]) => void,
): EditingRoom | null {
  // The same topic is still closing (left a moment ago): the caller tries again shortly.
  if (supabase.getChannels().some((c) => c.topic === `realtime:editing:${topic}`)) return null
  const tab = crypto.randomUUID()
  let typing = false
  let live = false
  const channel = supabase.channel(`editing:${topic}`, { config: { presence: { key: tab } } })
  const send = () => {
    if (live) void channel.track({ userId: me.userId, name: me.name(), typing })
  }

  // Tracked from join/leave events: one entry per browser tab. (The client's own
  // presenceState() keeps entries that have left, so it can't be used for this.)
  const tabs = new Map<string, Meta>()
  const report = () => {
    const names = new Set<string>()
    for (const [key, meta] of tabs) {
      if (key === tab || meta.typing !== true) continue
      // Sent by other browsers: don't trust the shape.
      const name = typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim().slice(0, 80) : 'Someone'
      names.add(meta.userId === me.userId ? 'Another tab of yours' : name)
    }
    onOthers([...names])
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
    setTyping(on) {
      if (on === typing) return
      typing = on
      send()
    },
    leave() {
      void supabase.removeChannel(channel)
    },
  }
}
