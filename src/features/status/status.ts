// People's status, like Teams: Available, In a call, Busy, Do not disturb, Away, Offline.
// Shared over Realtime Presence only (lib/presence.ts `joinGroupStatus`): no table, no API request.
// The status a person picks is remembered per browser (localStorage); the rest is automatic.

import type { StatusTabMeta } from '@/lib/presence'

export type Status = 'available' | 'call' | 'busy' | 'dnd' | 'away' | 'offline'
/** What a person can pick in their profile menu. */
export type ChosenStatus = 'available' | 'busy' | 'dnd' | 'away'
export const CHOOSABLE: ChosenStatus[] = ['available', 'busy', 'dnd', 'away']

export const statusLabel: Record<Status, string> = {
  available: 'Available',
  call: 'In a call',
  busy: 'Busy',
  dnd: 'Do not disturb',
  away: 'Away',
  offline: 'Offline',
}

/** Several tabs of one person: the strongest wins. */
const RANK: Record<Status, number> = { call: 5, dnd: 4, busy: 3, available: 2, away: 1, offline: 0 }
const SENT = new Set<string>(['available', 'call', 'busy', 'dnd', 'away'])

/** No input in any Calsko tab for this long turns Available into Away. */
export const AWAY_AFTER_MS = 5 * 60 * 1000

/** This tab's status: a call beats everything; idle only turns Available into Away (as Teams does). */
export function tabStatus(chosen: ChosenStatus, inCall: boolean, idle: boolean): Status {
  if (inCall) return 'call'
  if (chosen !== 'available') return chosen
  return idle ? 'away' : 'available'
}

/** Everyone's status from all tabs in the group. Entries come from other browsers: checked, never trusted. */
export function combine(tabs: Map<string, StatusTabMeta>): Map<string, Status> {
  const byUser = new Map<string, Status>()
  for (const meta of tabs.values()) {
    if (typeof meta.userId !== 'string' || typeof meta.status !== 'string' || !SENT.has(meta.status)) continue
    const status = meta.status as Status
    const before = byUser.get(meta.userId)
    if (!before || RANK[status] > RANK[before]) byUser.set(meta.userId, status)
  }
  return byUser
}

// --- the status this person picked, per browser ---------------------------------------------
const KEY = 'devdock:status'

export function readChosen(): ChosenStatus {
  const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
  return CHOOSABLE.includes(value as ChosenStatus) ? (value as ChosenStatus) : 'available'
}

export function writeChosen(status: ChosenStatus) {
  if (status === 'available') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, status)
  window.dispatchEvent(new Event(KEY))
}

/** Changes from this tab (custom event) or another (storage event). */
export function onChosenChange(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener()
  }
  window.addEventListener(KEY, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(KEY, listener)
    window.removeEventListener('storage', onStorage)
  }
}
