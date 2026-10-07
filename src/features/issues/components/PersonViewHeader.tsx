import { PersonAvatar } from '@/components/PersonRow'
import { useIssueContext } from '../hooks'
import { personOf } from '../views'
import { useActiveView } from '../viewsHooks'

/** Above the list when it shows one person's issues (from the members page, a pin, or ?assignee=). */
export function PersonViewHeader() {
  const { members, userId } = useIssueContext()
  const { view, state } = useActiveView()
  const id = view ? null : personOf(state)
  if (!id) return null
  const person = members.find((member) => member.user_id === id)
  const name = person?.profile?.display_name ?? 'Former member'
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <PersonAvatar profile={person?.profile ?? null} className="size-6" fallbackClassName="text-[10px]" />
      <h2 className="text-sm font-semibold">{id === userId ? 'Your issues' : `${name}’s issues`}</h2>
    </div>
  )
}
