import { useMutation } from '@tanstack/react-query'
import { LoaderCircle, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { TeamMember } from '@/features/teams/api'
import { errorMessage } from '@/lib/errors'
import { addGroupMember } from '../api'

export function AddGroupMemberDialog({ conversationId, members, people, onAdded }: { conversationId: string; members: { user_id: string }[]; people: TeamMember[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState('')
  const [history, setHistory] = useState<'all' | 'today' | 'after'>('after')
  const add = useMutation({
    mutationFn: () => addGroupMember(conversationId, userId, history),
    onSuccess: () => { onAdded(); setOpen(false); setUserId('') },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const candidates = people.filter((person) => !members.some((member) => member.user_id === person.user_id))
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="xs"><Users /> Add member</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a group member</DialogTitle><DialogDescription>Choose how much existing message history this person can see.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="group-member">Person</Label><select id="group-member" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Choose a person</option>{candidates.map((person) => <option key={person.user_id} value={person.user_id}>{person.profile?.display_name ?? 'Unnamed member'}</option>)}</select></div>
          <div className="space-y-2"><Label>History access</Label>{([['after', 'Only after adding'], ['today', 'From today'], ['all', 'From the beginning']] as const).map(([value, label]) => <label key={value} className="flex items-start gap-2 text-sm"><input type="radio" name="history-access" checked={history === value} onChange={() => setHistory(value)} /><span>{label}</span></label>)}</div>
        </div>
        <DialogFooter><Button onClick={() => add.mutate()} disabled={!userId || add.isPending}>{add.isPending && <LoaderCircle className="animate-spin" />}Add member</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
