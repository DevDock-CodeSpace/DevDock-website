// The shape panel's "Recently used": the last few library items added (by click or
// drag), newest first, remembered in this browser. Per viewer, never saved with a diagram.

import { ICONS } from './icons'
import { BLOCK_KINDS, SHAPE_KINDS, type LibraryItem } from './model'

const KEY = 'devdock-diagram-recent'
/** Three rows of the panel's grid. */
export const RECENT_MAX = 9

/** One identity per item: adding it again moves it to the front instead of listing it twice. */
export function itemKey(item: LibraryItem): string {
  if (item.type === 'shape') return `shape:${item.shape}`
  if (item.type === 'icon') return `icon:${item.icon}`
  if (item.type === 'block') return `block:${item.block}`
  return `container:${item.variant}:${item.label ?? ''}`
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A library item from storage or a drag, or null when it isn't one this editor knows. */
export function toLibraryItem(raw: unknown): LibraryItem | null {
  if (!isRecord(raw)) return null
  if (raw.type === 'shape' && SHAPE_KINDS.includes(raw.shape as never)) return { type: 'shape', shape: raw.shape as (typeof SHAPE_KINDS)[number] }
  if (raw.type === 'icon' && typeof raw.icon === 'string' && raw.icon in ICONS) return { type: 'icon', icon: raw.icon }
  if (raw.type === 'block' && BLOCK_KINDS.includes(raw.block as never)) return { type: 'block', block: raw.block as (typeof BLOCK_KINDS)[number] }
  if (raw.type === 'container' && (raw.variant === 'solid' || raw.variant === 'dashed')) {
    const label = typeof raw.label === 'string' && raw.label.length <= 40 ? raw.label : undefined
    return { type: 'container', variant: raw.variant, ...(label ? { label } : {}) }
  }
  return null
}

export function readRecent(): LibraryItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.flatMap((raw) => toLibraryItem(raw) ?? []).slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

function remember(list: LibraryItem[]): LibraryItem[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage unavailable (private mode): remembered for this visit only.
  }
  return list
}

/** `item` moved (or added) to the front, the list kept short and remembered. */
export function withRecent(list: LibraryItem[], item: LibraryItem): LibraryItem[] {
  const key = itemKey(item)
  return remember([item, ...list.filter((other) => itemKey(other) !== key)].slice(0, RECENT_MAX))
}

/** The list without `item` (its × in the panel). */
export function withoutRecent(list: LibraryItem[], item: LibraryItem): LibraryItem[] {
  const key = itemKey(item)
  return remember(list.filter((other) => itemKey(other) !== key))
}
