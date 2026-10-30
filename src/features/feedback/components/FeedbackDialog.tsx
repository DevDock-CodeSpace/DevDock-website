import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { FEEDBACK_KINDS, FEEDBACK_MAX, sendFeedback, type FeedbackKind } from '../api'

/**
 * The Feedback form (lazy, from LazyFeedbackDialog, opened from the profile menu). What's typed stays while the dialog is closed, so
 * closing it by accident loses nothing; sending clears it.
 */
export function FeedbackDialog({ open, onOpenChange, teamId }: { open: boolean; onOpenChange: (open: boolean) => void; teamId: string | null }) {
  const [kind, setKind] = useState<FeedbackKind>('problem')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = FEEDBACK_KINDS.find((k) => k.value === kind) ?? FEEDBACK_KINDS[0]

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!message.trim() || pending) return
    setPending(true)
    setError(null)
    try {
      await sendFeedback(kind, message, teamId)
      setMessage('')
      setKind('problem')
      onOpenChange(false)
      toast.success('Thanks! Your feedback reached the Calsko team.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void submit(e)} className="space-y-4" data-feedback-form>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>Found a problem or have an idea? It goes straight to the people who build Calsko.</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Kind of feedback" className="flex flex-wrap gap-1.5">
            {FEEDBACK_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-sm transition-colors',
                  kind === k.value ? 'border-brand bg-brand/10 font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feedback-message">Your message</Label>
            <Textarea
              id="feedback-message"
              value={message}
              maxLength={FEEDBACK_MAX}
              placeholder={chosen.placeholder}
              autoFocus
              className="max-h-[50svh] min-h-32"
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(e)
              }}
            />
            <p className="text-xs text-muted-foreground">We also get the page you’re on and your browser, to help us find problems.</p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!message.trim() || pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
