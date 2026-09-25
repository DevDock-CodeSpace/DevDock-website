import { CircleUserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { PersonAvatar } from '@/components/PersonRow'
import type { WorkspaceMember } from '@/features/workspaces/api'
import { Picker } from './Picker'

const NOBODY = 'none'

/** Assign to a workspace member (the database only accepts members), or nobody. */
export function AssigneePicker({
  value,
  members,
  userId,
  onChange,
  children,
  align,
  open,
  onOpenChange,
}: {
  value: string | null
  members: WorkspaceMember[]
  /** The caller, listed first as in Linear. */
  userId: string
  onChange: (assigneeId: string | null) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const sorted = [...members].sort((a, b) => Number(b.user_id === userId) - Number(a.user_id === userId))
  return (
    <Picker
      open={open}
      onOpenChange={onOpenChange}
      placeholder="Assign to…"
      align={align}
      selected={[value ?? NOBODY]}
      onSelect={(v) => {
        const next = v === NOBODY ? null : v
        if (next !== value) onChange(next)
      }}
      options={[
        { value: NOBODY, label: 'No assignee', icon: <CircleUserRound className="size-4 text-muted-foreground" /> },
        ...sorted.map((m) => ({
          value: m.user_id,
          label: `${m.profile?.display_name ?? 'Unnamed member'}${m.user_id === userId ? ' (you)' : ''}`,
          icon: <PersonAvatar profile={m.profile} className="size-4" />,
        })),
      ]}
    >
      {children}
    </Picker>
  )
}
