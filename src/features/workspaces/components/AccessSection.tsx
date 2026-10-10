import { useMutation, useQueryClient, useSuspenseQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SettingsSection } from '@/components/SettingsSection'
import { Label } from '@/components/ui/label'
import { CollectionSelect } from '@/features/collections/components/CollectionSelect'
import { teamMembersQuery } from '@/features/teams/api'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { workspaceTypes } from '@/features/teams/permissions'
import { errorMessage } from '@/lib/errors'
import { accessLabel, narrows } from '../access'
import {
  setWorkspaceAccess,
  setWorkspaceCollection,
  teamCollectionsQuery,
  workspaceMembersQuery,
  type WorkspaceAccess,
} from '../api'
import { AccessSelect } from './AccessSelect'

/**
 * Workspace settings → who can see it, and which collection it is in. Group owners and admins only.
 * Opening up applies at once; narrowing asks first and names who loses access.
 */
export function AccessSection() {
  const { team } = useCurrentTeam()
  const { workspace } = useCurrentWorkspace()
  const queryClient = useQueryClient()
  // The first two are already cached by the shell and the workspace header; the group's member list
  // (for telling admins apart) starts with them, so nothing here waits on anything else.
  const [{ data: collections }, { data: people }, { data: groupMembers }] = useSuspenseQueries({
    queries: [teamCollectionsQuery(team.id), workspaceMembersQuery(workspace.id), teamMembersQuery(team.id)],
  })
  const admins = new Set(groupMembers.filter((m) => m.role !== 'member').map((m) => m.user_id))
  const [narrowTo, setNarrowTo] = useState<WorkspaceAccess | null>(null)
  const collection = collections.find((c) => c.id === workspace.collection_id)
  const noun = workspaceTypes[workspace.type].noun

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'team', team.id] }),
    ])

  const changeAccess = useMutation({
    mutationFn: (access: WorkspaceAccess) => setWorkspaceAccess(workspace.id, access),
    onSuccess: (_, access) => {
      setNarrowTo(null)
      toast.success(`Now visible to: ${accessLabel(access, collection).toLowerCase()}`)
      return refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const move = useMutation({
    mutationFn: (collectionId: string | null) => setWorkspaceCollection(workspace.id, collectionId),
    onSuccess: (_, collectionId) => {
      const target = collections.find((c) => c.id === collectionId)
      toast.success(target ? `Moved to ${target.name}` : 'Moved out of its collection')
      return refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  // People who are in only because of the current setting, and would not be under the new one.
  // Group owners and admins see everything anyway.
  const losing = (to: WorkspaceAccess) =>
    people.filter(
      (p) =>
        p.via !== 'member' &&
        !admins.has(p.user_id) &&
        !(to === 'collection' && collection?.memberIds.includes(p.user_id)),
    )
  const leaving = narrowTo ? losing(narrowTo) : []
  const names = leaving.map((p) => p.profile?.display_name ?? 'Unnamed member')

  return (
    <SettingsSection
      title="Who can see it"
      description={`Group owners and admins always see every ${noun}. Only they can change this.`}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ws-access">Besides owners and admins</Label>
          <AccessSelect
            id="ws-access"
            value={workspace.access}
            collection={collection}
            disabled={changeAccess.isPending}
            onChange={(next) => {
              if (next === workspace.access) return
              if (narrows(workspace.access, next) && losing(next).length > 0) setNarrowTo(next)
              else changeAccess.mutate(next)
            }}
          />
        </div>
        {collections.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="ws-collection">Collection</Label>
            <CollectionSelect
              id="ws-collection"
              value={workspace.collection_id}
              collections={collections}
              disabled={move.isPending}
              onChange={(next) => next !== workspace.collection_id && move.mutate(next)}
            />
            <p className="text-xs text-muted-foreground">
              Moving it never changes who can see it
              {workspace.access === 'collection' && collection
                ? `: the people in ${collection.name} stay, as members.`
                : '.'}
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={narrowTo !== null}
        onOpenChange={(open) => !open && setNarrowTo(null)}
        title={`Limit ${workspace.title}?`}
        description={
          <>
            {leaving.length === 1 ? '1 person loses' : `${leaving.length} people lose`} access because they were never
            added to it: {names.slice(0, 5).join(', ')}
            {names.length > 5 ? ` and ${names.length - 5} more` : ''}. Add anyone who should stay on the Members tab
            first.
          </>
        }
        confirmLabel="Limit access"
        pending={changeAccess.isPending}
        onConfirm={() => narrowTo && changeAccess.mutate(narrowTo)}
      />
    </SettingsSection>
  )
}
