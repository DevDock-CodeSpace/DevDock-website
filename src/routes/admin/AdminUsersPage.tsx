import { useSuspenseQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { adminUsersQuery } from '@/features/admin/api'
import { formatDate, timeSince } from '@/lib/format'

/** /admin/users: every account, the groups it's in, and when it signed up and last signed in. */
export function AdminUsersPage() {
  const users = useSuspenseQuery(adminUsersQuery()).data
  const [now] = useState(Date.now)
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) =>
      [u.display_name ?? '', u.email ?? '', ...u.groups.map((g) => g.name)].some((text) => text.toLowerCase().includes(q)),
    )
  }, [users, search])

  return (
    <>
      <PageHeader title="Users" description={`${users.length} ${users.length === 1 ? 'account' : 'accounts'}.`}>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or group" aria-label="Search users" className="pl-8" />
        </div>
      </PageHeader>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No user matches that search.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Name</th>
                <th scope="col" className="py-2 pr-4 font-medium">Groups</th>
                <th scope="col" className="py-2 pr-4 font-medium">Signed up</th>
                <th scope="col" className="py-2 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((u) => (
                <tr key={u.id} data-admin-user={u.email ?? u.id} className="align-top">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.display_name ?? u.email ?? 'No name'}</span>
                      {u.is_platform_admin && <span className="rounded border border-brand/40 px-1.5 py-0.5 text-[11px] text-brand">Platform admin</span>}
                    </div>
                    {u.email && <div className="text-xs text-muted-foreground">{u.email}</div>}
                  </td>
                  <td className="py-2.5 pr-4">
                    {u.groups.length === 0 ? (
                      <span className="text-muted-foreground">None</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {u.groups.map((g) => (
                          <li key={g.id}>
                            {g.name} <span className="text-xs text-muted-foreground">· {g.role}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">{formatDate(u.created_at)}</td>
                  <td className="py-2.5 whitespace-nowrap text-muted-foreground">{u.last_sign_in_at ? timeSince(u.last_sign_in_at, now) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
