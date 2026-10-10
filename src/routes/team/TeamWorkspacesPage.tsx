import { useSuspenseQuery } from '@tanstack/react-query'
import { Pin } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { AvatarStack } from '@/components/PersonRow'
import { useAuth } from '@/features/auth/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { teamPath, workspacePath } from '@/features/teams/nav'
import { allowedWorkspaceTypes, workspaceRoleLabel, workspaceTypeOrder, workspaceTypes } from '@/features/teams/permissions'
import {
  myWorkspaceRolesQuery,
  teamCollectionsQuery,
  teamWorkspacesQuery,
  type WorkspaceType,
} from '@/features/workspaces/api'
import { CreateWorkspaceDialog } from '@/features/workspaces/components/CreateWorkspaceDialog'
import { usePins } from '@/features/workspaces/hooks'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

// name | type | leads | members | your role | updated | pin
const columns = 'md:grid-cols-[minmax(0,1fr)_96px_132px_72px_88px_104px_32px]'
const TYPES: WorkspaceType[] = ['course', 'project', 'general']

/**
 * Team home: a dense, scannable list of the workspaces the user can see,
 * filterable by type (?type=course, linked from the sidebar's "All courses") or
 * by collection (?collection=<id>), with a pin toggle per row. Pinned ones are listed first.
 */
export function TeamWorkspacesPage() {
  const { user } = useAuth()
  const { team, can } = useCurrentTeam()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  // Same cache entry as the workspaces (one request for both).
  const collections = useSuspenseQuery(teamCollectionsQuery(team.id)).data
  const myRoles = useSuspenseQuery(myWorkspaceRolesQuery(team.id, user.id)).data
  const { isPinned, setPinned } = usePins()
  const [now] = useState(Date.now)
  const [params] = useSearchParams()
  const typeParam = params.get('type')
  const type = TYPES.find((t) => t === typeParam) ?? null
  const presentTypes = workspaceTypeOrder(team.type).filter((t) => workspaces.some((w) => w.type === t))
  // Only collections with something the viewer can see; an unknown id shows everything.
  const presentCollections = collections.filter((c) => workspaces.some((w) => w.collection_id === c.id))
  const collection = presentCollections.find((c) => c.id === params.get('collection')) ?? null
  const collectionName = (id: string | null) => collections.find((c) => c.id === id)?.name
  const shown = workspaces
    .filter((w) => !type || w.type === type)
    .filter((w) => !collection || w.collection_id === collection.id)
    .sort((a, b) => Number(isPinned(b.id)) - Number(isPinned(a.id)))

  return (
    <>
      <PageHeader
        title={team.name}
        description={
          can.canManageWorkspaces
            ? `All ${allowedWorkspaceTypes[team.type].map((t) => workspaceTypes[t].plural.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1')} in this group.`
            : 'What you can open in this group.'
        }
      >
        {can.canManageWorkspaces && <CreateWorkspaceDialog />}
      </PageHeader>

      <div className="mb-2 flex items-center justify-between gap-3">
        <nav aria-label="Filter by type" className="flex items-center gap-0.5">
          {[null, ...(presentTypes.length > 1 || type ? presentTypes : [])].map((t) => (
            <Link
              key={t ?? 'all'}
              to={t ? `${teamPath(team.slug)}?type=${t}` : teamPath(team.slug)}
              aria-current={t === type && !collection ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                t === type && !collection ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t ? workspaceTypes[t].plural : 'All'}
            </Link>
          ))}
          {presentCollections.length > 0 && <span aria-hidden className="mx-1.5 h-3.5 w-px bg-border" />}
          {presentCollections.map((c) => (
            <Link
              key={c.id}
              to={`${teamPath(team.slug)}?collection=${c.id}`}
              aria-current={c.id === collection?.id ? 'page' : undefined}
              className={cn(
                'max-w-40 truncate rounded-md px-2.5 py-1 text-xs transition-colors',
                c.id === collection?.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>
        <span className="font-mono text-xs text-muted-foreground">{shown.length}</span>
      </div>

      {workspaces.length === 0 ? (
        <p className="border-y py-10 text-center text-sm text-muted-foreground">
          {can.canManageWorkspaces
            ? `Nothing here yet. Create a ${allowedWorkspaceTypes[team.type].map((t) => workspaceTypes[t].noun).join(', ').replace(/, ([^,]*)$/, ' or $1')}, then add people from this group to it.`
            : 'Nothing in this group is open to you yet. Ask a group owner or admin.'}
        </p>
      ) : (
        <div className="border-y">
          <div
            className={`hidden gap-4 border-b px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground md:grid ${columns}`}
          >
            <span>Name</span>
            <span>Type</span>
            <span>Lead</span>
            <span className="text-right">Members</span>
            <span>You</span>
            <span className="text-right">Updated</span>
            <span className="sr-only">Pin</span>
          </div>
          <ul className="divide-y">
            {shown.map((workspace) => {
              const { label: typeLabel, icon: TypeIcon } = workspaceTypes[workspace.type]
              const myRole = myRoles[workspace.id]
              const pinned = isPinned(workspace.id)
              return (
                <li
                  key={workspace.id}
                  className={`group relative grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1 px-3 py-2.5 transition-colors hover:bg-muted/50 has-[a:focus-visible]:bg-muted/50 ${columns}`}
                >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <TypeIcon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <Link
                          to={workspacePath(team.slug, workspace.id)}
                          className="block truncate text-sm font-medium outline-none after:absolute after:inset-0"
                        >
                          {workspace.title}
                        </Link>
                        {(workspace.description || collectionName(workspace.collection_id)) && (
                          <p className="truncate text-xs text-muted-foreground">
                            {[collectionName(workspace.collection_id), workspace.description].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="hidden text-sm text-muted-foreground md:block">{typeLabel}</span>
                    <span className="hidden items-center gap-2 md:flex">
                      {workspace.leads.length > 0 ? (
                        <>
                          <AvatarStack people={workspace.leads} max={2} />
                          <span className="truncate text-xs text-muted-foreground">
                            {workspace.leads[0].display_name?.split(' ')[0]}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </span>
                    <span className="hidden text-right font-mono text-xs text-muted-foreground md:block">
                      {workspace.memberCount}
                    </span>
                    <span className={`text-xs ${myRole === 'lead' ? 'font-medium text-brand' : 'text-muted-foreground'}`}>
                      {myRole ? workspaceRoleLabel[myRole] : can.isAdmin ? 'Admin' : workspaceRoleLabel.member}
                    </span>
                    <span className="hidden text-right font-mono text-xs text-muted-foreground md:block">
                      {timeAgo(workspace.updated_at, now)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPinned(workspace.id, !pinned)}
                      aria-label={pinned ? `Unpin ${workspace.title}` : `Pin ${workspace.title}`}
                      aria-pressed={pinned}
                      title={pinned ? 'Unpin from the sidebar' : 'Pin to the top of the sidebar'}
                      className={cn(
                        'relative z-10 flex size-7 items-center justify-center rounded-md transition-opacity hover:bg-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
                        pinned ? 'text-foreground' : 'text-muted-foreground opacity-0 group-hover:opacity-100',
                      )}
                    >
                      <Pin className={cn('size-3.5', pinned && 'fill-current')} />
                    </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}
