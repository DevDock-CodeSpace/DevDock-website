import { useEffect, useRef } from 'react'
import { PersonAvatar } from '@/components/PersonRow'
import type { TeamMember } from '@/features/teams/api'
import { markThreadRead, type Message } from '../api'
import { useSendReply } from '../hooks'
import { authorName, formatFullDate, formatTime } from '../names'
import { MessageBody } from './MessageBody'
import { MessageComposer } from './MessageComposer'

type Props = {
  conversationId: string
  teamId: string
  teamSlug: string
  parentId: string
  replies: Message[]
  people: TeamMember[]
  participants: TeamMember[]
  currentUserId: string
}

const noop = () => {}

export function ThreadReplyBox({ conversationId, teamId, teamSlug, parentId, replies, people, participants, currentUserId }: Props) {
  const send = useSendReply(conversationId, teamId, parentId)
  const retryId = useRef<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const mentionNames = people.flatMap((person) => (person.profile?.display_name ? [person.profile.display_name] : []))
  // Opening a thread under the newest message would leave it below the fold.
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  // Looking at the thread (and any reply that arrives while it's open) counts as reading it.
  useEffect(() => {
    markThreadRead(parentId).catch((error: unknown) => console.error('[messaging] Could not mark thread read', error))
  }, [parentId, replies.length])

  return (
    <div ref={box} className="mt-2 border-l-2 pl-3">
      <div className="space-y-2.5">
        {replies.map((reply) => {
          const author = people.find((person) => person.user_id === reply.author_id)
          return (
            <div key={reply.id} className="flex gap-2 text-sm">
              <PersonAvatar profile={author?.profile ?? null} className="mt-0.5 size-5" fallbackClassName="text-[10px]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <strong className="text-[13px]">{reply.author_id === currentUserId ? 'You' : authorName(reply.author_id, people)}</strong>
                  <time className="font-mono text-[10px] text-muted-foreground" dateTime={reply.created_at} title={formatFullDate(reply.created_at)}>{formatTime(reply.created_at)}</time>
                </div>
                {reply.deleted_at ? <p className="text-muted-foreground italic">This message was deleted.</p> : <MessageBody body={reply.body} fallback={reply.content} mentionNames={mentionNames} />}
              </div>
            </div>
          )
        })}
      </div>
      <MessageComposer
        draftId={`thread:${parentId}`}
        teamId={teamId}
        teamSlug={teamSlug}
        placeholder="Reply in thread"
        compact
        currentUserId={currentUserId}
        participants={participants}
        onTyping={noop}
        onSend={(input, restore) => {
          const clientId = retryId.current ?? crypto.randomUUID()
          retryId.current = null
          send.mutate(
            { ...input, clientId },
            {
              onError: () => {
                retryId.current = clientId
                restore()
              },
            },
          )
        }}
      />
    </div>
  )
}
