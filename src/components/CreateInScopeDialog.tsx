import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Globe, LoaderCircle, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentTeam } from '@/features/teams/hooks'
import { workspaceTypes } from '@/features/teams/permissions'
import { teamWorkspacesQuery } from '@/features/workspaces/api'

const TEAM_WIDE = 'team'

type CreateInScopeDialogProps = {
  /** Singular, lower case: "doc", "diagram". */
  noun: string
  placeholder: string
  /** Fixes the scope (used inside a workspace tab). */
  workspaceId?: string
  /** Who may create in a scope (null = team-wide). Mirrors RLS; UI only. */
  canWrite: (workspaceId: string | null) => boolean
  create: (input: { teamId: string; workspaceId: string | null; title: string }) => Promise<{ id: string }>
  /** Query key prefix to invalidate after creating. */
  queryKey: readonly string[]
  /** Where to go after creating. */
  pathFor: (id: string) => string
}

/**
 * New doc/diagram/…: pick a title and a scope (Team-wide or a workspace), then open it.
 * Only scopes the user may write to are offered; renders nothing if there are none.
 */
export function CreateInScopeDialog({
  noun,
  placeholder,
  workspaceId,
  canWrite,
  create: createItem,
  queryKey,
  pathFor,
}: CreateInScopeDialogProps) {
  const { team } = useCurrentTeam()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const options = workspaceId
    ? canWrite(workspaceId)
      ? [workspaceId]
      : []
    : [...(canWrite(null) ? [TEAM_WIDE] : []), ...workspaces.filter((w) => canWrite(w.id)).map((w) => w.id)]
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState(options[0] ?? TEAM_WIDE)

  const create = useMutation({
    mutationFn: () => createItem({ teamId: team.id, workspaceId: scope === TEAM_WIDE ? null : scope, title }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey })
      setOpen(false)
      navigate(pathFor(id))
    },
  })

  if (options.length === 0) return null

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
          setScope(options[0])
          create.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New {noun}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New {noun}</DialogTitle>
            <DialogDescription>
              {workspaceId
                ? 'Visible to everyone in this workspace and to group owners/admins.'
                : `Group-wide ${noun}s are visible to the whole group. Workspace ${noun}s only to that workspace (and group owners/admins).`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-item-title">Title</Label>
            <Input
              id="new-item-title"
              value={title}
              maxLength={200}
              placeholder={placeholder}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          {!workspaceId && (
            <div className="space-y-1.5">
              <Label htmlFor="new-item-scope">Belongs to</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="new-item-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((id) => {
                    if (id === TEAM_WIDE) {
                      return (
                        <SelectItem key={id} value={id}>
                          <Globe className="text-muted-foreground" />
                          Group-wide
                        </SelectItem>
                      )
                    }
                    const workspace = workspaces.find((w) => w.id === id)
                    if (!workspace) return null
                    const Icon = workspaceTypes[workspace.type].icon
                    return (
                      <SelectItem key={id} value={id}>
                        <Icon className="text-muted-foreground" />
                        {workspace.title}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">This can’t be changed later.</p>
            </div>
          )}
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
