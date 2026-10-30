import { useSyncExternalStore } from 'react'
import { combine, onChosenChange, readChosen, type ChosenStatus, type Status } from './status'
import type { StatusTabMeta } from '@/lib/presence'

// Everyone's status in the open group, outside React so a change re-renders only the dots whose
// person changed (useSyncExternalStore per person), not every component on the page.
let byUser = new Map<string, Status>()
const listeners = new Set<() => void>()

export function setStatusTabs(tabs: Map<string, StatusTabMeta>) {
  byUser = combine(tabs)
  for (const listener of listeners) listener()
}

export function clearStatuses() {
  byUser = new Map()
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A person's status in the open group; Offline when no tab of theirs is connected. */
export function useUserStatus(userId: string | null | undefined): Status {
  return useSyncExternalStore(subscribe, () => (userId ? (byUser.get(userId) ?? 'offline') : 'offline'))
}

/** The status this person picked in this browser. */
export function useChosenStatus(): ChosenStatus {
  return useSyncExternalStore(onChosenChange, readChosen)
}
