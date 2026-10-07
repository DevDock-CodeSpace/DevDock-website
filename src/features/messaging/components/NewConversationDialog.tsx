import { useMutation } from '@tanstack/react-query'
import { LoaderCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/hooks'
import type { TeamMember } from '@/features/teams/api'
import { errorMessage } from '@/lib/errors'
import { createChannel, createDirectConversation, createGroupConversation, findExistingGroup, type ConversationKind } from '../api'

export function NewConversationDialog({ teamId, people, canCreateChannel, onCreated }: { teamId: string; people: TeamMember[]; canCreateChannel: boolean; onCreated: (id: string) => void }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ConversationKind>('dm')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [existingGroupId, setExistingGroupId] = useState<string | null>(null)
  const [checkingGroup, setCheckingGroup] = useState(false)
  const create = useMutation({
    mutationFn: async () => {
      if (kind === 'channel') return createChannel(teamId, name, description)
      if (kind === 'group') return createGroupConversation(teamId, name, [user.id, ...selected.filter((id) => id !== user.id)])
      const target = selected[0]
      if (!target) throw new Error('Choose a group member.')
      return createDirectConversation(teamId, target)
    },
    onSuccess: (id) => { onCreated(id); setOpen(false); setName(''); setDescription(''); setSelected([]) },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const candidates = people.filter((person) => person.user_id !== user.id)
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  const startCreate = async () => {
    if (kind !== 'group') {
      create.mutate()
      return
    }
    setCheckingGroup(true)
    try {
      const existing = await findExistingGroup(teamId, [user.id, ...selected])
      if (existing) setExistingGroupId(existing)
      else create.mutate()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setCheckingGroup(false)
    }
  }
  const finishWithExisting = () => {
    if (!existingGroupId) return
    onCreated(existingGroupId)
    setExistingGroupId(null)
    setOpen(false)
    setSelected([])
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon-sm" aria-label="New conversation" title="New conversation"><Plus /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New conversation</DialogTitle><DialogDescription>Private messages are visible only to their participants.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
            {(['dm', 'group', ...(canCreateChannel ? ['channel' as const] : [])] as ConversationKind[]).map((option) => <Button key={option} type="button" size="sm" variant={kind === option ? 'secondary' : 'ghost'} onClick={() => { setKind(option); setSelected([]) }}>{option === 'dm' ? 'Direct' : option === 'group' ? 'Group' : 'Channel'}</Button>)}
          </div>
          {kind !== 'dm' && <><Label htmlFor="conversation-name">{kind === 'channel' ? 'Channel name' : 'Group name'}</Label><Input id="conversation-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder={kind === 'channel' ? 'announcements' : 'Study partners'} required /></>}
          {kind === 'channel' && <><Label htmlFor="conversation-description">Description</Label><Textarea id="conversation-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={2} /></>}
          <div className="space-y-2"><Label>{kind === 'dm' ? 'Person' : 'Participants'}</Label>{candidates.map((person) => <label key={person.user_id} className="flex items-center gap-2 text-sm"><input type={kind === 'dm' ? 'radio' : 'checkbox'} name="conversation-person" checked={selected.includes(person.user_id)} onChange={() => kind === 'dm' ? setSelected([person.user_id]) : toggle(person.user_id)} />{person.profile?.display_name ?? 'Unnamed member'}</label>)}</div>
        </div>
        <DialogFooter><Button onClick={startCreate} disabled={create.isPending || checkingGroup || (kind === 'dm' ? selected.length !== 1 : !name.trim() || (kind === 'group' && selected.length === 0))}>{(create.isPending || checkingGroup) && <LoaderCircle className="animate-spin" />}Create</Button></DialogFooter>
      </DialogContent>
      <Dialog open={existingGroupId !== null} onOpenChange={(next) => { if (!next) setExistingGroupId(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>This group already exists</DialogTitle><DialogDescription>A group with the same participants is already in this group. Use it to keep one shared history, or create a new group with a different name.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setExistingGroupId(null)}>Create a new group</Button><Button onClick={finishWithExisting}>Use existing group</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
