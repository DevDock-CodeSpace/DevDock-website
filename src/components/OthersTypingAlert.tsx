import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Warns that someone else is typing in the same text (names from useOthersTyping).
 * Edits aren't merged, so whoever saves last replaces the other's text.
 */
export function OthersTypingAlert({ names, className }: { names: string[]; className?: string }) {
  if (names.length === 0) return null
  const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')
  return (
    <p role="alert" className={cn('mb-3 flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm', className)}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
      <span>
        <span className="font-medium">
          {who} {names.length === 1 ? 'is' : 'are'} typing here right now.
        </span>{' '}
        <span className="text-muted-foreground">Edits aren’t merged: whoever saves last replaces the other’s text.</span>
      </span>
    </p>
  )
}
