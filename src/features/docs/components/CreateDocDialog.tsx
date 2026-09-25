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
import { docPath } from '@/features/teams/nav'
import { workspaceTypes } from '@/features/teams/permissions'
import { teamWorkspacesQuery } from '@/features/workspaces/api'
import { createDocument } from '../api'
import { useCanWriteDocs } from '../hooks'

const TEAM_WIDE = 'team'

/**
 * New doc: pick a title and a scope (Team-wide or a workspace), then open it.
 * Only scopes the user may write to are offered; renders nothing if there are none.
 * With `workspaceId` the scope is fixed (used inside a workspace's Docs tab).
 */
export function CreateDocDialog({ workspaceId }: { workspaceId?: string }) {
  const { team } = useCurrentTeam()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const canWrite = useCanWriteDocs()
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
    mutationFn: () =>
      createDocument({ teamId: team.id, workspaceId: scope === TEAM_WIDE ? null : scope, title }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['documents'] })
      setOpen(false)
      // Open it where it was created: inside the workspace tab, or in the team view.
      navigate(docPath(team.slug, id, workspaceId))
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
          <Plus /> New doc
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New doc</DialogTitle>
            <DialogDescription>
              {workspaceId
                ? 'Visible to everyone in this workspace and to team owners/admins.'
                : 'Team-wide docs are visible to the whole team. Workspace docs only to that workspace (and team owners/admins).'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              value={title}
              maxLength={200}
              placeholder="Onboarding checklist"
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          {!workspaceId && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-scope">Belongs to</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="doc-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((id) => {
                    if (id === TEAM_WIDE) {
                      return (
                        <SelectItem key={id} value={id}>
                          <Globe className="text-muted-foreground" />
                          Team-wide
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
              Create doc
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
