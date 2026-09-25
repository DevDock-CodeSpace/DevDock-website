import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { teamPath } from '@/features/teams/nav'
import { deleteWorkspace, updateWorkspace, workspaceQuery, type WorkspaceType } from '@/features/workspaces/api'
import { WorkspaceTypeSelect } from '@/features/workspaces/components/WorkspaceTypeSelect'
import { errorMessage } from '@/lib/errors'

export function WorkspaceSettingsPage() {
  const { workspace, can } = useCurrentWorkspace()

  if (!can.canEdit) {
    return (
      <>
        <PageHeader title="Settings" />
        <p className="text-sm text-muted-foreground">Only the workspace lead and team owners/admins can change workspace settings.</p>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Settings" description="Workspace details." />
      <div className="space-y-6">
        <DetailsCard key={workspace.updated_at} />
        {can.canDelete && <DeleteWorkspaceCard />}
      </div>
    </>
  )
}

function DetailsCard() {
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(workspace.title)
  const [description, setDescription] = useState(workspace.description ?? '')
  const [type, setType] = useState<WorkspaceType>(workspace.type)
  const dirty =
    title.trim() !== workspace.title || description.trim() !== (workspace.description ?? '') || type !== workspace.type

  const save = useMutation({
    mutationFn: () => updateWorkspace(workspace.id, { title, description, type }),
    onSuccess: () => {
      toast.success('Workspace saved')
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: workspaceQuery(workspace.id).queryKey }),
        queryClient.invalidateQueries({ queryKey: ['workspaces', 'team', team.id] }),
      ])
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (dirty && title.trim()) save.mutate()
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Shown to everyone in the workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="ws-type">Type</Label>
            <WorkspaceTypeSelect id="ws-type" value={type} onChange={setType} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-title">Title</Label>
            <Input id="ws-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-description">Description</Label>
            <Textarea
              id="ws-description"
              value={description}
              maxLength={5000}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!dirty || !title.trim() || save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function DeleteWorkspaceCard() {
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const remove = useMutation({
    mutationFn: () => deleteWorkspace(workspace.id),
    onSuccess: async () => {
      toast.success(`${workspace.title} was deleted`)
      // Leave the page before dropping its data (see useExitTeam for why).
      await navigate(teamPath(team.slug), { replace: true })
      queryClient.removeQueries({ queryKey: ['workspaces', workspace.id] })
      await queryClient.invalidateQueries({ queryKey: ['workspaces', 'team', team.id] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle>Delete workspace</CardTitle>
        <CardDescription>Removes the workspace and everyone’s access to it. People stay in the team.</CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Delete workspace
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${workspace.title}?`}
        description="This can’t be undone."
        confirmLabel="Delete workspace"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  )
}
