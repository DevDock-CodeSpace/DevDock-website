import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Plus } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentTeam } from '@/features/teams/hooks'
import { workspacePath } from '@/features/teams/nav'
import { defaultWorkspaceType, workspaceNoun } from '@/features/teams/permissions'
import { createWorkspace, type WorkspaceType } from '../api'
import { WorkspaceTypeSelect } from './WorkspaceTypeSelect'

/** `trigger` lets the sidebar open it with its own menu item. */
export function CreateWorkspaceDialog({ trigger }: { trigger?: ReactNode }) {
  const { team } = useCurrentTeam()
  const noun = workspaceNoun[team.type].singular
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<WorkspaceType>(defaultWorkspaceType[team.type])

  const create = useMutation({
    mutationFn: () => createWorkspace(team.id, { title, description, type }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setOpen(false)
      navigate(workspacePath(team.slug, id))
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (title.trim()) create.mutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setTitle('')
          setDescription('')
          setType(defaultWorkspaceType[team.type])
          create.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> New {noun.toLowerCase()}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New {noun.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Only team owners and admins see it until you add people to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ws-type">Type</Label>
            <WorkspaceTypeSelect id="ws-type" value={type} onChange={setType} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-title">Title</Label>
            <Input
              id="ws-title"
              value={title}
              maxLength={200}
              placeholder={type === 'course' ? 'Software Engineering Fundamentals' : type === 'project' ? 'Capstone API' : 'Study group'}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-description">Description</Label>
            <Textarea
              id="ws-description"
              value={description}
              maxLength={5000}
              rows={3}
              placeholder="What is this workspace for?"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-destructive">
              {create.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {create.isPending && <LoaderCircle className="animate-spin" />}
              Create {noun.toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
