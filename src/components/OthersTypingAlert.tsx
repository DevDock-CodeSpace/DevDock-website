import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Says who is editing the same text right now (names from useOthersTyping's
 * `lockedBy`). Edits aren't merged, so the text is read-only for everyone else
 * until that person has been quiet for a few seconds; their changes show live.
 */
export function OthersTypingAlert({ names, className }: { names: string[]; className?: string }) {
  if (names.length === 0) return null
  const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')
  return (
    <p role="status" className={cn('mb-3 flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm', className)}>
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span>
        <span className="font-medium">
          {who} {names.length === 1 ? 'is' : 'are'} editing this right now.
        </span>{' '}
        <span className="text-muted-foreground">You can edit as soon as they stop. Their changes appear here as they save.</span>
      </span>
    </p>
  )
}
