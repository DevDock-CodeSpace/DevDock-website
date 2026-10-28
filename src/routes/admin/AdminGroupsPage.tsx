import { useSuspenseQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { adminGroupsQuery, type AdminGroup } from '@/features/admin/api'
import { formatDate, timeSince } from '@/lib/format'

// Spelled out instead of importing teamTypes: that module (with its icons) would join the first load.
const TYPE_LABEL: Record<AdminGroup['type'], string> = { learning: 'Learning', development: 'Development', general: 'General' }

/** /admin/groups: every group with its owner, counts, dates and the flags switched on for it. */
export function AdminGroupsPage() {
  const groups = useSuspenseQuery(adminGroupsQuery()).data
  const [now] = useState(Date.now)
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) =>
      [g.name, g.slug, g.owner_name ?? '', g.owner_email ?? ''].some((text) => text.toLowerCase().includes(q)),
    )
  }, [groups, search])

  return (
    <>
      <PageHeader title="Groups" description={`${groups.length} ${groups.length === 1 ? 'group' : 'groups'}. Names and counts only.`}>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search groups" aria-label="Search groups" className="pl-8" />
        </div>
      </PageHeader>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{groups.length === 0 ? 'No groups yet.' : 'No group matches that search.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Group</th>
                <th scope="col" className="py-2 pr-4 font-medium">Type</th>
                <th scope="col" className="py-2 pr-4 font-medium">Owner</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Members</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Workspaces</th>
                <th scope="col" className="py-2 pr-4 font-medium">Created</th>
                <th scope="col" className="py-2 pr-4 font-medium">Last activity</th>
                <th scope="col" className="py-2 font-medium">Flags on</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((g) => (
                <tr key={g.id} data-admin-group={g.slug} className="align-top">
                  <td className="py-2.5 pr-4">
                    <div className="font-medium">{g.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{g.slug}</div>
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{TYPE_LABEL[g.type]}</td>
                  <td className="py-2.5 pr-4">
                    {g.owner_email ? (
                      <>
                        <div>{g.owner_name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{g.owner_email}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No owner</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{g.member_count}</td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{g.workspace_count}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">{formatDate(g.created_at)}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">{g.last_activity ? timeSince(g.last_activity, now) : 'None yet'}</td>
                  <td className="py-2.5">
                    {g.enabled_features.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {g.enabled_features.map((key) => (
                          <span key={key} className="rounded border px-1.5 py-0.5 font-mono text-[11px]">
                            {key}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
