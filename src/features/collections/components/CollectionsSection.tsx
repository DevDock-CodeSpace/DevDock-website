import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SettingsSection } from '@/components/SettingsSection'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrentTeam } from '@/features/teams/hooks'
import { teamTypes } from '@/features/teams/permissions'
import { teamCollectionsQuery, teamWorkspacesQuery, type Collection } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import { deleteCollection } from '../api'
import { CollectionDialog } from './CollectionDialog'
import { CollectionPeopleDialog } from './CollectionPeopleDialog'

/**
 * Group settings → Collections: create them, choose their people, rename and delete. Group owners
 * and admins only. Things are moved into a collection from their own settings.
 */
export function CollectionsSection() {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  // Both read the cache entry the shell already loaded.
  const collections = useSuspenseQuery(teamCollectionsQuery(team.id)).data
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Collection | null>(null)
  const [peopleOf, setPeopleOf] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Collection | null>(null)
  // Looked up again on every render, so the open dialog follows live changes.
  const peopleCollection = collections.find((c) => c.id === peopleOf)
  const inside = (collection: Collection) => workspaces.filter((w) => w.collection_id === collection.id)

  const remove = useMutation({
    mutationFn: (collection: Collection) => deleteCollection(collection.id),
    onSuccess: async (_, collection) => {
      setDeleting(null)
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      toast.success(`${collection.name} deleted`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <SettingsSection
      title="Collections"
      description="Optional. Group courses, projects and spaces, and give each set its own people, such as Learning and Development."
    >
      {collections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No collections. Everything sits directly in the group.</p>
      ) : (
        <ul className="divide-y border-y">
          {collections.map((collection) => {
            const count = inside(collection).length
            return (
              <li key={collection.id} className="flex min-h-12 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{collection.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {teamTypes[collection.type].label} · {collection.memberIds.length}{' '}
                    {collection.memberIds.length === 1 ? 'person' : 'people'} · {count} {count === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPeopleOf(collection.id)}>
                  People
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${collection.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(collection)}>Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(collection)}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
        </ul>
      )}
      <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreating(true)}>
        <Plus /> New collection
      </Button>

      {creating && <CollectionDialog onClose={() => setCreating(false)} />}
      {editing && <CollectionDialog collection={editing} onClose={() => setEditing(null)} />}
      {peopleCollection && <CollectionPeopleDialog collection={peopleCollection} onClose={() => setPeopleOf(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'this collection'}?`}
        description={
          deleting && inside(deleting).length > 0
            ? `Its ${inside(deleting).length === 1 ? 'item returns' : `${inside(deleting).length} items return`} to the group itself; nothing in them is deleted. Anything open to ${deleting.name} keeps its people, who become members by name, so nobody loses access.`
            : 'It has nothing in it. Only the collection and its list of people go.'
        }
        confirmLabel="Delete collection"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </SettingsSection>
  )
}
