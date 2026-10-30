import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { WorkspaceMember } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import type { ImportPerson } from '../api'
import { useMapImportAssignee } from '../hooks'

const NOBODY = 'nobody'

/**
 * "People from imports" for one project: each name an imported file used for an assignee, who it is
 * in Calsko, and how many issues still wait for someone. Changing a person assigns those issues,
 * and later imports match the name by themselves. Nothing when no import has named anyone.
 */
export function ImportPeopleList({ workspaceId, people, members }: { workspaceId: string; people: ImportPerson[]; members: WorkspaceMember[] }) {
  const map = useMapImportAssignee(workspaceId)
  if (people.length === 0) return null
  const waiting = people.reduce((sum, p) => sum + (p.user_id ? 0 : p.waiting), 0)

  const change = (name: string, value: string) => {
    const userId = value === NOBODY ? null : value
    const person = members.find((m) => m.user_id === userId)
    map
      .mutateAsync({ name, userId })
      .then((assigned) => {
        if (!userId) toast.success(`${name} isn’t mapped to anyone now`)
        else toast.success(`${name} is ${person?.profile?.display_name ?? 'them'}${assigned ? ` · ${assigned === 1 ? '1 issue' : `${assigned} issues`} assigned` : ''}`)
      })
      .catch((error: unknown) => toast.error(errorMessage(error)))
  }

  return (
    <div>
      <h3 className="text-sm font-medium">People from imports</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {waiting > 0
          ? `${waiting === 1 ? '1 issue is' : `${waiting} issues are`} waiting for someone to be chosen. Add the person to the project, then pick them here.`
          : 'Each name from an imported file, and who it is in Calsko. Later imports use these matches.'}
      </p>
      <div className="mt-3 divide-y border-y">
        {people.map((p) => (
          <div key={p.name} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <span className="block truncate text-sm" title={p.name}>{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {p.user_id ? 'Mapped' : p.waiting > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400"><span className="font-mono">{p.waiting}</span> {p.waiting === 1 ? 'issue' : 'issues'} waiting</span>
                ) : 'Not mapped'}
              </span>
            </div>
            <Select
              value={p.user_id ?? NOBODY}
              disabled={map.isPending}
              onValueChange={(v) => {
                // Radix reports '' when its options change under it.
                if (v !== '' && v !== (p.user_id ?? NOBODY)) change(p.name, v)
              }}
            >
              <SelectTrigger aria-label={`Person for ${p.name}`} className="h-8 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOBODY} className="text-xs text-muted-foreground">Not mapped</SelectItem>
                {/* Someone mapped earlier who has since left the project still shows by name. */}
                {p.user_id && !members.some((m) => m.user_id === p.user_id) && (
                  <SelectItem value={p.user_id} className="text-xs">Former member</SelectItem>
                )}
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id} className="text-xs">
                    {m.profile?.display_name ?? 'Unnamed'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  )
}
