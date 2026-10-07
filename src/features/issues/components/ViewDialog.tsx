import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  workspaceTitle: string
  initial?: { name: string; shared: boolean }
  pending: boolean
  /** Only the owner can change who a view is shared with. */
  canShare?: boolean
  onSubmit: (name: string, shared: boolean) => void
}

/** Name a saved view and choose whether the whole workspace can use it. */
export function ViewDialog({ open, onOpenChange, mode, workspaceTitle, initial, pending, canShare = true, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [shared, setShared] = useState(initial?.shared ?? false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() && !pending) onSubmit(name.trim(), shared)
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Save view' : 'Edit view'}</DialogTitle>
            <DialogDescription>
              {mode === 'create' ? 'Keep these filters, tab and layout so you can open them again, or pin them to your sidebar.' : 'Rename the view or change who can use it.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="view-name">Name</Label>
            <Input id="view-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="e.g. Bugs in review" autoFocus />
          </div>
          <label className={`flex items-start gap-2.5 text-sm ${canShare ? '' : 'opacity-60'}`}>
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={shared} disabled={!canShare} onChange={(event) => setShared(event.target.checked)} />
            <span>
              <span className="font-medium">Share with everyone in {workspaceTitle}</span>
              <span className="block text-xs text-muted-foreground">
                {canShare ? 'Anyone in the workspace can open and pin it. Only you and the workspace leads can change it.' : 'Only the owner can change this.'}
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              {mode === 'create' ? 'Save view' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
