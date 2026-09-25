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
import { defaultModules, workspacePath } from '@/features/teams/nav'
import { defaultWorkspaceType, workspaceTypes } from '@/features/teams/permissions'
import { createWorkspace, type WorkspaceModule, type WorkspaceType } from '../api'
import { ModulePicker } from './ModulePicker'
import { WorkspaceTypeSelect } from './WorkspaceTypeSelect'

/**
 * `trigger` lets the sidebar open it with its own menu item. The team type only
 * picks the default workspace type; any team can create any type.
 */
export function CreateWorkspaceDialog({ trigger }: { trigger?: ReactNode }) {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<WorkspaceType>(defaultWorkspaceType[team.type])
  const [modules, setModules] = useState<WorkspaceModule[]>(defaultModules[defaultWorkspaceType[team.type]])
  // Type → default tools, until the user picks tools themselves.
  const [modulesEdited, setModulesEdited] = useState(false)
  const noun = workspaceTypes[type].noun
  const changeType = (next: WorkspaceType) => {
    setType(next)
    if (!modulesEdited) setModules(defaultModules[next])
  }

  const create = useMutation({
    mutationFn: () => createWorkspace(team.id, { title, description, type, modules }),
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
          setModules(defaultModules[defaultWorkspaceType[team.type]])
          setModulesEdited(false)
          create.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> New
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New {noun}</DialogTitle>
            <DialogDescription>
              Only team owners and admins see it until you add people to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ws-type">Type</Label>
            <WorkspaceTypeSelect id="ws-type" value={type} onChange={changeType} />
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
          <div className="space-y-1.5">
            <Label>Tools</Label>
            <ModulePicker
              value={modules}
              onChange={(next) => {
                setModulesEdited(true)
                setModules(next)
              }}
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
              Create {noun}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
