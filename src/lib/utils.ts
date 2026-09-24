export { cn } from "cn"

/** Up to two uppercase initials, e.g. "Ada Lovelace" → "AL". */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
