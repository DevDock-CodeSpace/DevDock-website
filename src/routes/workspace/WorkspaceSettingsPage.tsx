import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/hooks'
import { deleteWorkspace, removeWorkspaceMember, renameWorkspace } from '@/features/workspaces/api'
import { useCurrentWorkspace, useExitWorkspace } from '@/features/workspaces/hooks'
import { workspaceRoleLabel } from '@/features/workspaces/permissions'
import { errorMessage } from '@/lib/errors'

export function WorkspaceSettingsPage() {
  const { workspace, role, can } = useCurrentWorkspace()

  return (
    <>
      <PageHeader title="Settings" description={`Workspace settings. Your role: ${workspaceRoleLabel[role]}.`} />
      <div className="space-y-6">
        <GeneralCard key={workspace.id} />
        {can.canLeave && <LeaveCard />}
        {can.canDelete && <DeleteCard />}
      </div>
    </>
  )
}

function GeneralCard() {
  const { workspace, can } = useCurrentWorkspace()
  const queryClient = useQueryClient()
  const [name, setName] = useState(workspace.name)
  const dirty = name.trim() !== workspace.name && name.trim().length > 0

  const rename = useMutation({
    mutationFn: () => renameWorkspace(workspace.id, name),
    onSuccess: () => {
      toast.success('Workspace renamed')
      return queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (dirty) rename.mutate()
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            {can.canRename ? 'Owners and admins can rename the workspace.' : 'Only owners and admins can change these.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              maxLength={100}
              disabled={!can.canRename}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <p className="font-mono text-sm text-muted-foreground">/w/{workspace.slug}</p>
          </div>
        </CardContent>
        {can.canRename && (
          <CardFooter className="justify-end">
            <Button type="submit" disabled={!dirty || rename.isPending}>
              {rename.isPending && <LoaderCircle className="animate-spin" />}
              Save
            </Button>
          </CardFooter>
        )}
      </form>
    </Card>
  )
}

function LeaveCard() {
  const { user } = useAuth()
  const { workspace } = useCurrentWorkspace()
  const exitWorkspace = useExitWorkspace()
  const [confirming, setConfirming] = useState(false)

  const leave = useMutation({
    mutationFn: () => removeWorkspaceMember(workspace.id, user.id),
    onSuccess: async () => {
      toast.success(`You left ${workspace.name}`)
      await exitWorkspace(workspace.id)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave workspace</CardTitle>
        <CardDescription>You’ll lose access to this workspace and all of its courses.</CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <Button variant="outline" onClick={() => setConfirming(true)}>
          Leave workspace
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Leave ${workspace.name}?`}
        description="You’ll need a new invite code to come back."
        confirmLabel="Leave"
        pending={leave.isPending}
        onConfirm={() => leave.mutate()}
      />
    </Card>
  )
}

function DeleteCard() {
  const { workspace } = useCurrentWorkspace()
  const exitWorkspace = useExitWorkspace()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')

  const remove = useMutation({
    mutationFn: () => deleteWorkspace(workspace.id),
    onSuccess: async () => {
      toast.success(`${workspace.name} was deleted`)
      await exitWorkspace(workspace.id)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle>Delete workspace</CardTitle>
        <CardDescription>
          Permanently deletes the workspace, its courses, memberships, and invite codes. This can’t be undone.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Delete workspace
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open)
          if (!open) setTyped('')
        }}
        title={`Delete ${workspace.name}?`}
        description="Everyone loses access immediately. Type the workspace name to confirm."
        confirmLabel="Delete forever"
        pending={remove.isPending}
        confirmDisabled={typed !== workspace.name}
        onConfirm={() => remove.mutate()}
      >
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={workspace.name} aria-label="Workspace name" />
      </ConfirmDialog>
    </Card>
  )
}
