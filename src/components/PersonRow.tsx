import type { ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { PersonProfile } from '@/features/teams/api'
import { cn, initials } from '@/lib/utils'

type PersonRowProps = {
  profile: PersonProfile
  isYou?: boolean
  role: string
  /** Emphasized role (owner, lead). */
  highlight?: boolean
  meta?: ReactNode
  actions?: ReactNode
}

/** One person in a member list: avatar, name, meta, role, and optional actions. */
export function PersonRow({ profile, isYou, role, highlight, meta, actions }: PersonRowProps) {
  const name = profile?.display_name ?? 'Unnamed member'
  return (
    <li className="flex min-h-12 items-center gap-3 px-3 py-2 hover:bg-muted/40">
      <PersonAvatar profile={profile} className="size-7" />
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

export function PersonAvatar({ profile, className }: { profile: PersonProfile; className?: string }) {
  const name = profile?.display_name ?? '?'
  return (
    <Avatar className={cn('size-6 rounded-full', className)}>
      {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="rounded-full text-[9px] font-medium">{initials(name)}</AvatarFallback>
    </Avatar>
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
