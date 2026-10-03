import type { Json } from '@/types/database.types'

type MaybeJson = Json | null | undefined

/**
 * Deep equality that ignores key order and undefined values: Postgres jsonb
 * reorders keys, so saved JSON never comes back byte-for-byte.
 */
export function sameJson(a: MaybeJson, b: MaybeJson): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]))
  }
  const keys = Object.keys(a).filter((k) => a[k] !== undefined)
  return keys.length === Object.keys(b).filter((k) => b[k] !== undefined).length && keys.every((k) => sameJson(a[k], b[k]))
}
