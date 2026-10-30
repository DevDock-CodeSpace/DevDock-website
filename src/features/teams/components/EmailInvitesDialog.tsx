import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { emailInvites, invitesQuery } from '../api'
import { useCurrentTeam } from '../hooks'

const MAX_EMAILS = 20
const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/

/** Addresses separated by commas, semicolons, spaces or new lines; "Name <a@b.c>" keeps the address. */
function parseEmails(text: string) {
  const found = text
    .split(/[\s,;]+/)
    .map((part) => part.replace(/^<|>$/g, '').trim().toLowerCase())
    .filter((part) => part.includes('@'))
  const unique = [...new Set(found)]
  return { valid: unique.filter((e) => EMAIL.test(e)), invalid: unique.filter((e) => !EMAIL.test(e)) }
}

/** Owners/admins: email people a single-use invite code each, with a link that opens the join page. */
export function EmailInvitesDialog() {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const { valid, invalid } = parseEmails(text)
  const tooMany = valid.length > MAX_EMAILS

  const send = useMutation({
    mutationFn: () => emailInvites(team.id, valid),
    onSuccess: async (sent) => {
      await queryClient.invalidateQueries({ queryKey: invitesQuery(team.id).queryKey })
      setOpen(false)
      setText('')
      toast.success(sent === 1 ? 'Invite sent' : `${sent} invites sent`)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid.length > 0 && invalid.length === 0 && !tooMany) send.mutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) send.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail /> Email invites
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Email invites</DialogTitle>
            <DialogDescription>
              Each person gets their own invite code by email, with a link to join{' '}
              <strong className="font-medium">{team.name}</strong> as a member. Codes work once and expire in 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="invite-emails">Email addresses</Label>
            <Textarea
              id="invite-emails"
              value={text}
              rows={4}
              autoFocus
              spellCheck={false}
              placeholder="ana@example.com, sam@example.com"
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {invalid.length > 0
                ? `Check ${invalid.length === 1 ? 'this address' : 'these addresses'}: ${invalid.join(', ')}`
                : tooMany
                  ? `At most ${MAX_EMAILS} at a time (${valid.length} entered).`
                  : 'Separate addresses with commas or new lines, up to 20 at a time. Calsko doesn’t keep them.'}
            </p>
          </div>
          {send.isError && (
            <p role="alert" className="text-sm text-destructive">
              {send.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={valid.length === 0 || invalid.length > 0 || tooMany || send.isPending}>
              {send.isPending && <LoaderCircle className="animate-spin" />}
              {valid.length > 1 ? `Send ${valid.length} invites` : 'Send invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
