import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { PersonAvatar } from '@/components/PersonRow'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { getWorkspaceTabs, workspacePath, workspaceTabDefs } from '@/features/teams/nav'
import { workspaceRoleLabel, workspaceTypes } from '@/features/teams/permissions'
import { workspaceMembersQuery } from '@/features/workspaces/api'
import { formatDate } from '@/lib/format'

const PREVIEW = 6

/** Flat overview: about + upcoming sections on the left, people + details on the right. */
export function WorkspaceOverviewPage() {
  const { team } = useCurrentTeam()
  const { workspace, can } = useCurrentWorkspace()
  const members = useSuspenseQuery(workspaceMembersQuery(workspace.id)).data
  const base = workspacePath(team.slug, workspace.id)
  const leads = members.filter((m) => m.role === 'lead')
  // Leads first, then everyone else in join order.
  const people = [...leads, ...members.filter((m) => m.role !== 'lead')]
  // The not-yet-built feature tabs for this workspace type.
  const sections = getWorkspaceTabs(team.slug, workspace.id, workspace.type).filter((tab) => workspaceTabDefs[tab.id].soon)

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-10">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">About</h2>
          {workspace.description ? (
            <p className="max-w-prose whitespace-pre-wrap text-[15px] leading-relaxed">{workspace.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No description yet.
              {can.canEdit && (
                <>
                  {' '}
                  <Link to={`${base}/settings`} className="underline underline-offset-4 hover:text-foreground">
                    Add one
                  </Link>
                </>
              )}
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">In this {workspaceTypes[workspace.type].label.toLowerCase()}</h2>
          <ul className="divide-y border-y">
            {sections.map((section) => {
              return (
                <li key={section.to}>
                  <Link
                    to={section.to}
                    className="group flex items-center gap-3 px-1 py-2.5 text-sm hover:bg-muted/40"
                  >
                    <section.icon className="size-4 text-muted-foreground" />
                    <span className="font-medium">{section.title}</span>
                    <span className="hidden truncate text-muted-foreground sm:inline">{workspaceTabDefs[section.id].soon}</span>
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">soon</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      <aside className="space-y-10 xl:border-l xl:pl-8">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">People</h2>
            <span className="font-mono text-xs text-muted-foreground">{members.length}</span>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has been added yet.</p>
          ) : (
            <ul className="space-y-2">
              {people.slice(0, PREVIEW).map((member) => (
                <li key={member.user_id} className="flex items-center gap-2.5 text-sm">
                  <PersonAvatar profile={member.profile} />
                  <span className="min-w-0 flex-1 truncate">{member.profile?.display_name ?? 'Unnamed member'}</span>
                  <span className={member.role === 'lead' ? 'text-xs font-medium text-brand' : 'text-xs text-muted-foreground'}>
                    {workspaceRoleLabel[member.role]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            to={`${base}/members`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {members.length > PREVIEW ? `All ${members.length} members` : 'Manage members'} <ArrowRight className="size-3.5" />
          </Link>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Details</h2>
          <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{workspaceTypes[workspace.type].label}</dd>
            <dt className="text-muted-foreground">Team</dt>
            <dd className="truncate">{team.name}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-mono text-xs leading-5">{formatDate(workspace.created_at)}</dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd className="font-mono text-xs leading-5">{formatDate(workspace.updated_at)}</dd>
          </dl>
        </section>
      </aside>
    </div>
  )
}
