import { BellOff, Hash, Users } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { PersonAvatar } from '@/components/PersonRow'
import type { PersonProfile } from '@/features/teams/api'
import { cn } from '@/lib/utils'
import { displayName } from '../names'

type Props = {
  kind: string
  title: string
  /** The other person, for a direct message. */
  profile?: PersonProfile
  active: boolean
  unread: number
  mentions: number
  muted: boolean
  onClick: () => void
}

export function ConversationItem({ kind, title, profile, active, unread, mentions, muted, onClick }: Props) {
  const hasUnread = unread > 0 && !active
  const ref = useRef<HTMLButtonElement>(null)
  // On a phone the list is a scrolling strip: keep the open conversation in view.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [active])
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex h-8 min-w-36 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors lg:w-full',
        active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        hasUnread && !muted && 'font-semibold text-foreground',
      )}
    >
      {kind === 'channel' ? (
        <Hash className={cn('size-4 shrink-0', active && 'text-brand')} />
      ) : kind === 'dm' ? (
        <PersonAvatar profile={profile ?? null} className="size-5" />
      ) : (
        <Users className={cn('size-4 shrink-0', active && 'text-brand')} />
      )}
      <span className="min-w-0 flex-1 truncate">{displayName(title)}</span>
      {muted && <BellOff className="size-3.5 shrink-0 opacity-60" aria-label="Muted" />}
      {hasUnread && (
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 font-mono text-[10px] leading-4 font-medium',
            mentions > 0 ? 'bg-brand text-brand-foreground' : 'bg-foreground/10 text-foreground',
          )}
          aria-label={`${unread} unread${mentions > 0 ? `, ${mentions} mention${mentions === 1 ? '' : 's'}` : ''}`}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
