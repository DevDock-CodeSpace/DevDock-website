import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TeamType } from '@/features/teams/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import { teamTypes } from '@/features/teams/permissions'
import type { Collection } from '@/features/workspaces/api'
import { createCollection, updateCollection } from '../api'

/** New collection, or (with `collection`) its name and type. Mount it only while open. */
export function CollectionDialog({ collection, onClose }: { collection?: Collection; onClose: () => void }) {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const [name, setName] = useState(collection?.name ?? '')
  const [type, setType] = useState<TeamType>(collection?.type ?? 'general')

  const save = useMutation({
    mutationFn: async () => {
      if (collection) await updateCollection(collection.id, { name, type })
      else await createCollection(team.id, { name, type })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces', 'team', team.id] })
      toast.success(collection ? 'Saved' : `${name.trim()} created`)
      onClose()
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim()) save.mutate()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{collection ? 'Edit collection' : 'New collection'}</DialogTitle>
            <DialogDescription>
              A collection holds courses, projects and spaces, and has its own people. Open something to it and they
              all get in without being added one by one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              value={name}
              maxLength={80}
              placeholder="Learning"
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="collection-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as TeamType)}>
              <SelectTrigger id="collection-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(teamTypes) as TeamType[]).map((value) => {
                  const { label, icon: Icon } = teamTypes[value]
                  return (
                    <SelectItem key={value} value={value}>
                      <Icon className="text-muted-foreground" />
                      {label}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" />}
              {collection ? 'Save' : 'Create collection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
