import type { ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusDot } from '@/features/status/components/StatusDot'
import type { PersonProfile } from '@/features/teams/api'
import { cn, initials } from '@/lib/utils'

type PersonRowProps = {
  profile: PersonProfile
  /** Shows their live status on the avatar. */
  userId?: string
  isYou?: boolean
  role: string
  /** Emphasized role (owner, lead). */
  highlight?: boolean
  meta?: ReactNode
  actions?: ReactNode
}

/** One person in a member list: avatar, name, meta, role, and optional actions. */
export function PersonRow({ profile, userId, isYou, role, highlight, meta, actions }: PersonRowProps) {
  const name = profile?.display_name ?? 'Unnamed member'
  return (
    <li className="flex min-h-12 items-center gap-3 px-3 py-2 hover:bg-muted/40">
      <PersonAvatar profile={profile} userId={userId} className="size-7" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {name}
          {isYou && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">you</span>}
        </p>
      </div>
      {meta && <span className="hidden font-mono text-xs text-muted-foreground sm:block">{meta}</span>}
      <span
        className={cn(
          'w-16 text-right text-xs',
          highlight ? 'font-medium text-brand' : 'text-muted-foreground',
        )}
      >
        {role}
      </span>
      <div className="flex w-8 justify-end">{actions}</div>
    </li>
  )
}

/** A person's avatar; with `userId`, their live status sits on its corner (features/status). */
export function PersonAvatar({
  profile,
  userId,
  className,
  fallbackClassName,
}: {
  profile: PersonProfile
  userId?: string
  className?: string
  fallbackClassName?: string
}) {
  const name = profile?.display_name ?? '?'
  const avatar = (
    <Avatar className={cn('size-6 rounded-full', className)}>
      {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className={cn('rounded-full text-[9px] font-medium', fallbackClassName)}>{initials(name)}</AvatarFallback>
    </Avatar>
  )
  if (!userId) return avatar
  return (
    <span className="relative inline-flex shrink-0">
      {avatar}
      <StatusDot userId={userId} />
    </span>
  )
}

/** Overlapping avatars, e.g. a workspace's leads. */
export function AvatarStack({ people, max = 3 }: { people: NonNullable<PersonProfile>[]; max?: number }) {
  const shown = people.slice(0, max)
  return (
    <div className="flex items-center -space-x-1">
      {shown.map((person, i) => (
        <PersonAvatar key={i} profile={person} className="size-6 ring-2 ring-background" />
      ))}
      {people.length > max && (
        <span className="pl-2.5 font-mono text-xs text-muted-foreground">+{people.length - max}</span>
      )}
    </div>
  )
}
