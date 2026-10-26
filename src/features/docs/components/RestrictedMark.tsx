import { Lock } from 'lucide-react'

/** The lock beside a restricted doc, whiteboard or folder (only people with access see the item at all). */
export function RestrictedMark() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" title="Restricted: only its owner, the people it's shared with, and group owners/admins">
      <Lock className="size-3" aria-hidden />
      <span className="sr-only">Restricted ·</span>
    </span>
  )
}
