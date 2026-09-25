import type { ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import type { PersonProfile } from '@/features/teams/api'
import { initials } from '@/lib/utils'

type PersonRowProps = {
  profile: PersonProfile
  isYou?: boolean
  role: string
  /** Emphasized role badge (owner, lead). */
  highlight?: boolean
  meta?: ReactNode
  actions?: ReactNode
}

/** One person in a member list: avatar, name, role, and optional actions. */
export function PersonRow({ profile, isYou, role, highlight, meta, actions }: PersonRowProps) {
  const name = profile?.display_name ?? 'Unnamed member'
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar className="size-9 rounded-md">
        {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />}
        <AvatarFallback className="rounded-md text-xs">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {name}
          {isYou && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">you</span>}
        </p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      <Badge variant={highlight ? 'default' : 'outline'}>{role}</Badge>
      {actions}
    </li>
  )
}
