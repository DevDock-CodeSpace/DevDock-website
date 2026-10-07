import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2, MessageSquare, Pencil, Pin, SmilePlus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { TeamMember } from '@/features/teams/api'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import {
  conversationKeys,
  deleteMessage,
  editMessage,
  togglePin,
  toggleReaction,
  type Message,
  type MessageAttachment,
  type Reaction,
} from '../api'
import { authorName, formatFullDate, formatTime, isPendingMessage, MESSAGE_REACTIONS, messagePermalink } from '../names'
import { AttachmentItem } from './AttachmentItem'
import { MessageBody } from './MessageBody'
import { MessageEditor } from './MessageEditor'
import { ThreadReplyBox } from './ThreadReplyBox'

type Props = {
  message: Message
  conversationId: string
  teamId: string
  people: TeamMember[]
  currentUserId: string
  pinned: boolean
  reactions: Reaction[]
  attachments: MessageAttachment[]
  replies: Message[]
  participants: TeamMember[]
  teamSlug: string
  /** Replies in this thread you haven't seen yet. */
  threadUnread: number
  /** Same author as the message above, a moment later: no avatar or name, just the text. */
  compact: boolean
}

const toolbarButton = 'size-7 text-muted-foreground hover:text-foreground'

export function MessageItem({ message, conversationId, teamId, teamSlug, people, participants, currentUserId, pinned, reactions, attachments, replies, threadUnread, compact }: Props) {
  const queryClient = useQueryClient()
  const [threadOpen, setThreadOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const refreshMessages = () => queryClient.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) })
  const edit = useMutation({
    mutationFn: ({ content, body }: { content: string; body: Message['body'] }) => editMessage(message.id, content, body),
    onSuccess: () => {
      setEditing(false)
      void refreshMessages()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const remove = useMutation({ mutationFn: () => deleteMessage(message.id), onSuccess: () => void refreshMessages(), onError: (error) => toast.error(errorMessage(error)) })
  const react = useMutation({
    mutationFn: ({ emoji, active }: { emoji: string; active: boolean }) => toggleReaction({ messageId: message.id, conversationId, teamId, userId: currentUserId, emoji, active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: conversationKeys.reactions(conversationId) }),
    onError: (error) => toast.error(errorMessage(error)),
  })
  const pin = useMutation({
    mutationFn: () => togglePin({ messageId: message.id, conversationId, teamId, active: pinned }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['messaging', 'pins', conversationId] }),
    onError: (error) => toast.error(errorMessage(error)),
  })
  const copyLink = () => {
    navigator.clipboard.writeText(messagePermalink(teamSlug, conversationId, message.id)).then(
      () => toast.success('Link copied'),
      () => toast.error('Could not copy the link.'),
    )
  }
  const mine = message.author_id === currentUserId
  const sending = isPendingMessage(message.id)
  const deleted = message.deleted_at !== null
  const person = people.find((item) => item.user_id === message.author_id)
  const name = mine ? 'You' : authorName(message.author_id, people)
  const time = formatTime(message.created_at)
  const mentionNames = people.flatMap((item) => (item.profile?.display_name ? [item.profile.display_name] : []))

  // One pill per emoji that has reactions: how many, whether you're in it, and who (on hover).
  const pills = MESSAGE_REACTIONS.flatMap((emoji) => {
    const forEmoji = reactions.filter((reaction) => reaction.emoji === emoji)
    if (forEmoji.length === 0) return []
    const active = forEmoji.some((reaction) => reaction.user_id === currentUserId)
    const who = forEmoji.map((reaction) => (reaction.user_id === currentUserId ? 'You' : authorName(reaction.user_id, people))).join(', ')
    return [{ emoji, count: forEmoji.length, active, who }]
  })
  const toggle = (emoji: string) => react.mutate({ emoji, active: reactions.some((reaction) => reaction.user_id === currentUserId && reaction.emoji === emoji) })

  return (
    <article
      id={`message-${message.id}`}
      className={cn(
        'group relative flex gap-3 px-4 transition-colors hover:bg-muted/40 focus-within:bg-muted/40',
        compact ? 'py-0.5' : 'pt-2 pb-1',
        sending && 'opacity-60',
      )}
    >
      <div className="w-8 shrink-0 pt-0.5">
        {compact ? (
          <time className="block pt-1 text-right font-mono text-[10px] text-transparent group-hover:text-muted-foreground" dateTime={message.created_at} title={formatFullDate(message.created_at)}>{time}</time>
        ) : (
          <PersonAvatar profile={person?.profile ?? null} className="size-8" fallbackClassName="text-xs" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold">{name}</span>
            <time className="font-mono text-[11px] text-muted-foreground" dateTime={message.created_at} title={formatFullDate(message.created_at)}>{time}</time>
            {message.edited_at && !deleted && <span className="text-xs text-muted-foreground">(edited)</span>}
            {sending && <span className="text-xs text-muted-foreground">Sending…</span>}
            {pinned && !deleted && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Pin className="size-3 fill-current" />Pinned</span>}
          </div>
        )}
        {compact && (message.edited_at || sending || pinned) && !deleted && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {message.edited_at && <span>(edited)</span>}
            {sending && <span>Sending…</span>}
            {pinned && <span className="flex items-center gap-1"><Pin className="size-3 fill-current" />Pinned</span>}
          </div>
        )}
        {deleted ? (
          <p className="text-sm text-muted-foreground italic">This message was deleted.</p>
        ) : editing ? (
          <MessageEditor body={message.body} saving={edit.isPending} onSave={(content, body) => edit.mutate({ content, body })} onCancel={() => setEditing(false)} />
        ) : (
          <MessageBody body={message.body} fallback={message.content} mentionNames={mentionNames} />
        )}
        {!deleted && attachments.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{attachments.map((attachment) => <AttachmentItem key={attachment.id} attachment={attachment} />)}</div>}
        {!deleted && !sending && pills.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {pills.map((pill) => (
              <button
                key={pill.emoji}
                type="button"
                onClick={() => toggle(pill.emoji)}
                aria-label={`Toggle ${pill.emoji} reaction`}
                aria-pressed={pill.active}
                title={pill.who}
                className={cn(
                  'flex h-6 items-center rounded-full border px-2 text-xs transition-colors',
                  pill.active ? 'border-brand/40 bg-brand/10 text-brand' : 'bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {pill.emoji} {pill.count}
              </button>
            ))}
          </div>
        )}
        {!deleted && !sending && replies.length > 0 && (
          <button type="button" onClick={() => setThreadOpen((open) => !open)} className="mt-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-medium text-brand hover:bg-brand/10" aria-expanded={threadOpen}>
            <MessageSquare className="size-3.5" />
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            {threadUnread > 0 && !threadOpen && <span className="rounded-full bg-brand px-1.5 font-mono text-[10px] leading-4 text-brand-foreground">{threadUnread} new</span>}
          </button>
        )}
        {threadOpen && !deleted && <ThreadReplyBox conversationId={conversationId} teamId={teamId} teamSlug={teamSlug} parentId={message.id} replies={replies} people={people} participants={participants} currentUserId={currentUserId} />}
      </div>

      {!deleted && !sending && !editing && (
        <div
          className={cn(
            'absolute -top-3.5 right-4 z-10 flex items-center rounded-md border bg-background p-0.5 shadow-sm',
            // Shown on hover or keyboard focus; always shown on touch screens, which can't hover.
            'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100',
            pickerOpen && '[@media(hover:hover)]:opacity-100',
          )}
        >
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-xs" className={toolbarButton} aria-label="Add reaction" title="Add reaction"><SmilePlus /></Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto flex-row gap-0.5 p-1">
              {MESSAGE_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Toggle ${emoji} reaction`}
                  className="flex size-8 items-center justify-center rounded text-base hover:bg-muted"
                  onClick={() => {
                    toggle(emoji)
                    setPickerOpen(false)
                  }}
                >
                  {emoji}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <ToolbarButton label="Reply in thread" onClick={() => setThreadOpen((open) => !open)}><MessageSquare /></ToolbarButton>
          <ToolbarButton label="Copy link to message" onClick={copyLink}><Link2 /></ToolbarButton>
          <ToolbarButton label={pinned ? 'Unpin message' : 'Pin message'} onClick={() => pin.mutate()} active={pinned}><Pin className={pinned ? 'fill-current' : undefined} /></ToolbarButton>
          {mine && (
            <>
              <ToolbarButton label="Edit message" onClick={() => setEditing(true)}><Pencil /></ToolbarButton>
              <ToolbarButton label="Delete message" onClick={() => remove.mutate()} disabled={remove.isPending}><Trash2 /></ToolbarButton>
            </>
          )}
        </div>
      )}
    </article>
  )
}

function ToolbarButton({ label, onClick, children, active, disabled }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <Button variant="ghost" size="icon-xs" className={cn(toolbarButton, active && 'text-brand')} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      {children}
    </Button>
  )
}
