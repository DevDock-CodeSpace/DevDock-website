import { Bell, ChevronDown, ChevronRight, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { formatNotificationTime } from '../names'

export function NotificationList({
  notifications,
  conversations,
  titleOf,
  onSelect,
}: {
  notifications: { id: string; conversation_id: string | null; message_id: string | null; created_at: string; read_at: string | null }[]
  conversations: { id: string; kind: string; name: string | null }[]
  /** The conversation's display name (a DM is named after the other person). */
  titleOf: (conversation: { id: string; kind: string; name: string | null }) => string
  onSelect: (conversationId: string, notificationId: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(true)
  if (notifications.length === 0) return null
  return (
    <section className="mx-2 mb-2 border-b pb-2" aria-label="Notifications">
      <button type="button" className="mb-1 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Bell className="size-3.5" /> Notifications <span className="ml-auto rounded-full bg-brand px-1.5 font-mono text-[10px] leading-4 text-brand-foreground">{notifications.length}</span>
      </button>
      {expanded && <div className="max-h-36 space-y-0.5 overflow-y-auto">
        {notifications.map((notification) => {
          const conversation = conversations.find((item) => item.id === notification.conversation_id)
          if (!conversation || !notification.conversation_id) return null
          return (
            <button
              key={notification.id}
              type="button"
              onClick={() => void onSelect(notification.conversation_id!, notification.id)}
              className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted ${notification.read_at ? 'text-muted-foreground' : 'font-medium'}`}
            >
              <MessageCircle className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">New message in {titleOf(conversation)}</span>
              <time className="shrink-0 text-[10px] text-muted-foreground" dateTime={notification.created_at}>{formatNotificationTime(notification.created_at)}</time>
            </button>
          )
        })}
      </div>}
    </section>
  )
}
