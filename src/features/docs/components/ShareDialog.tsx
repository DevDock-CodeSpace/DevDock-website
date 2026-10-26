import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Users, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/hooks'
import { teamMembersQuery, type PersonProfile } from '@/features/teams/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import { teamWorkspacesQuery, workspaceMembersQuery } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import { fileSharesQuery, setFileAccess, setShareRole, shareFile, unshareFile, type FileAccess, type FileKind, type ShareRole } from '../sharing'

export type ShareableItem = {
  id: string
  title: string
  team_id: string
  workspace_id: string | null
  access: FileAccess
  created_by: string | null
}

const KIND_NOUN: Record<FileKind, string> = { doc: 'doc', diagram: 'whiteboard', folder: 'folder' }

/**
 * Share a doc, whiteboard or folder: who may open it (everyone in its place, or restricted) and, when
 * restricted, the people it's shared with as viewers or editors. Its owner and group owners/admins
 * change it; everyone else sees who has access. The database re-checks every change.
 */
export function ShareDialog({ kind, item, open, onOpenChange }: { kind: FileKind; item: ShareableItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { team, can } = useCurrentTeam()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canManage = item.created_by === user.id || can.isAdmin
  const noun = KIND_NOUN[kind]

  // Who could be given it: the people who can open its place.
  const workspaceTitle = useQuery({ ...teamWorkspacesQuery(team.id), enabled: open && item.workspace_id !== null }).data?.find((w) => w.id === item.workspace_id)?.title
  const placeName = item.workspace_id ? (workspaceTitle ?? 'this workspace') : team.name
  const workspacePeople = useQuery({ ...workspaceMembersQuery(item.workspace_id ?? ''), enabled: open && item.workspace_id !== null }).data
  const groupPeople = useQuery({ ...teamMembersQuery(team.id), enabled: open && item.workspace_id === null }).data
  const people: { user_id: string; profile: PersonProfile }[] = (item.workspace_id ? workspacePeople : groupPeople) ?? []
  const shares = useQuery({ ...fileSharesQuery(kind, item.id), enabled: open }).data ?? []
  const nameOf = (userId: string) => people.find((p) => p.user_id === userId)?.profile?.display_name ?? 'Former member'
  const profileOf = (userId: string) => people.find((p) => p.user_id === userId)?.profile ?? null

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['file-shares', kind, item.id] }),
      queryClient.invalidateQueries({ queryKey: ['documents'] }),
      queryClient.invalidateQueries({ queryKey: ['diagrams'] }),
    ])
  const run = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
    onSuccess: () => void refresh(),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const [adding, setAdding] = useState('')
  const [addRole, setAddRole] = useState<ShareRole>('viewer')
  const candidates = people.filter((p) => p.user_id !== item.created_by && !shares.some((s) => s.user_id === p.user_id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">Share “{item.title}”</DialogTitle>
          <DialogDescription>
            {kind === 'folder' ? 'Everything inside this folder follows it. ' : ''}Group owners and admins can always open it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Who can open it</p>
          {canManage ? (
            <Select value={item.access} onValueChange={(value) => run.mutate(() => setFileAccess(kind, item.id, value as FileAccess))}>
              <SelectTrigger className="w-full" aria-label="Who can open it">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="place">
                  <Users className="text-muted-foreground" /> Everyone in {placeName}
                </SelectItem>
                <SelectItem value="restricted">
                  <Lock className="text-muted-foreground" /> Restricted: only the people below
                </SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {item.access === 'restricted' ? <Lock className="size-4" /> : <Users className="size-4" />}
              {item.access === 'restricted' ? 'Restricted: only the people below' : `Everyone in ${placeName}`}
            </p>
          )}
        </div>

        {item.access === 'restricted' && (
          <div className="space-y-2">
            <p className="text-sm font-medium">People with access</p>
            <ul className="divide-y rounded-md border">
              {item.created_by && (
                <li className="flex items-center gap-2.5 px-3 py-2">
                  <PersonAvatar profile={profileOf(item.created_by)} className="size-6" fallbackClassName="text-[10px]" />
                  <span className="min-w-0 flex-1 truncate text-sm">{item.created_by === user.id ? 'You' : nameOf(item.created_by)}</span>
                  <span className="text-xs text-muted-foreground">Owner</span>
                </li>
              )}
              {shares.map((share) => (
                <li key={share.id} className="flex items-center gap-2.5 px-3 py-2">
                  <PersonAvatar profile={profileOf(share.user_id)} className="size-6" fallbackClassName="text-[10px]" />
                  <span className="min-w-0 flex-1 truncate text-sm">{share.user_id === user.id ? 'You' : nameOf(share.user_id)}</span>
                  {canManage ? (
                    <>
                      <Select value={share.role} onValueChange={(role) => run.mutate(() => setShareRole(share.id, role as ShareRole))}>
                        <SelectTrigger size="sm" className="h-7 w-24 text-xs" aria-label={`${nameOf(share.user_id)}’s access`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Can view</SelectItem>
                          <SelectItem value="editor">Can edit</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon-xs" aria-label={`Remove ${nameOf(share.user_id)}`} onClick={() => run.mutate(() => unshareFile(share.id))}>
                        <X />
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">{share.role === 'editor' ? 'Can edit' : 'Can view'}</span>
                  )}
                </li>
              ))}
            </ul>
            {canManage && (
              <div className="flex gap-1.5">
                <Select value={adding} onValueChange={setAdding}>
                  <SelectTrigger className="min-w-0 flex-1" aria-label="Add a person">
                    <SelectValue placeholder={candidates.length ? 'Add a person…' : 'Everyone here already has access'} />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.profile?.display_name ?? 'Unnamed member'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={addRole} onValueChange={(role) => setAddRole(role as ShareRole)}>
                  <SelectTrigger className="w-28" aria-label="Their access">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Can view</SelectItem>
                    <SelectItem value="editor">Can edit</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  disabled={!adding || run.isPending}
                  onClick={() => {
                    const userId = adding
                    run.mutate(() => shareFile(kind, item.id, userId, addRole), { onSuccess: () => setAdding('') })
                  }}
                >
                  Add
                </Button>
              </div>
            )}
          </div>
        )}
        {!canManage && <p className="text-xs text-muted-foreground">Only its owner or a group admin can change this {noun}’s access.</p>}
      </DialogContent>
    </Dialog>
  )
}
