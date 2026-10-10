import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { teamMembersQuery } from '@/features/teams/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import type { Collection } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import { addCollectionMember, removeCollectionMember } from '../api'

/**
 * Who is in a collection: everyone in the group, each with Add or Remove. The group's member list
 * loads when this opens (it is usually cached already). Mount it only while open.
 */
export function CollectionPeopleDialog({ collection, onClose }: { collection: Collection; onClose: () => void }) {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const people = useQuery(teamMembersQuery(team.id))
  const inIt = new Set(collection.memberIds)

  const toggle = useMutation({
    mutationFn: ({ userId, add }: { userId: string; add: boolean }) =>
      add ? addCollectionMember(collection.id, userId) : removeCollectionMember(collection.id, userId),
    // Open workspaces list these people too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>People in {collection.name}</DialogTitle>
          <DialogDescription>
            They get into everything that is open to {collection.name}. Removing someone takes that access away; what
            they were added to by name stays.
          </DialogDescription>
        </DialogHeader>
        {people.isPending ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : people.isError ? (
          <p className="py-6 text-center text-sm text-destructive">{errorMessage(people.error)}</p>
        ) : (
          <ul className="max-h-[50svh] divide-y overflow-y-auto border-y">
            {[...people.data]
              .sort((a, b) => Number(inIt.has(b.user_id)) - Number(inIt.has(a.user_id)))
              .map((person) => {
                const member = inIt.has(person.user_id)
                const busy = toggle.isPending && toggle.variables?.userId === person.user_id
                return (
                  <li key={person.user_id} className="flex min-h-11 items-center gap-3 px-1 py-1.5">
                    <PersonAvatar profile={person.profile} className="size-6" />
                    <span className="min-w-0 flex-1 truncate text-sm">{person.profile?.display_name ?? 'Unnamed member'}</span>
                    <Button
                      size="sm"
                      variant={member ? 'ghost' : 'outline'}
                      disabled={busy}
                      onClick={() => toggle.mutate({ userId: person.user_id, add: !member })}
                    >
                      {member ? 'Remove' : 'Add'}
                    </Button>
                  </li>
                )
              })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
