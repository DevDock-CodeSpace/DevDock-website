import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { MessageCircle, Search } from 'lucide-react'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/hooks'
import { teamMembersQuery } from '@/features/teams/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import {
  searchMessagesQuery,
  teamConversationMembersQuery,
  teamConversationsQuery,
} from '@/features/messaging/api'
import { ConversationItem } from '@/features/messaging/components/ConversationItem'
import { NewConversationDialog } from '@/features/messaging/components/NewConversationDialog'
import { useUnread } from '@/features/messaging/hooks'
import { conversationTitle, displayName } from '@/features/messaging/names'
import { ownWrite } from '@/lib/realtime'

// The message editor (TipTap) is only needed once a conversation opens, so it loads on demand.
const ConversationView = lazy(() => import('@/features/messaging/components/ConversationView').then((m) => ({ default: m.ConversationView })))

export function MessagesPage() {
  const { team, can } = useCurrentTeam()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const conversations = useSuspenseQuery(teamConversationsQuery(team.id)).data
  const people = useSuspenseQuery(teamMembersQuery(team.id)).data
  const conversationMembers = useSuspenseQuery(teamConversationMembersQuery(team.id)).data
  const unread = useUnread(team.id)
  const [search, setSearch] = useState('')
  // The open conversation (and a message to scroll to) live in the URL, so links to a message work.
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('c') ?? undefined
  const targetMessageId = params.get('m') ?? undefined
  const select = useCallback(
    (conversationId: string, messageId?: string) =>
      setParams((current) => {
        const next = new URLSearchParams(current)
        next.set('c', conversationId)
        if (messageId) next.set('m', messageId)
        else next.delete('m')
        return next
      }, { replace: true }),
    [setParams],
  )
  const clearTarget = useCallback(
    () => setParams((current) => { const next = new URLSearchParams(current); next.delete('m'); return next }, { replace: true }),
    [setParams],
  )
  const searchResults = useQuery(searchMessagesQuery(team.id, search)).data ?? []

  const participants = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const member of conversationMembers) map.set(member.conversation_id, [...(map.get(member.conversation_id) ?? []), member.user_id])
    return map
  }, [conversationMembers])
  const titleOf = (conversation: { id: string; kind: string; name: string | null }) =>
    conversationTitle(conversation.kind, conversation.name, people, user.id, participants.get(conversation.id))
  const otherPerson = (conversation: { id: string; kind: string }) =>
    conversation.kind === 'dm' ? people.find((person) => person.user_id !== user.id && participants.get(conversation.id)?.includes(person.user_id))?.profile : undefined
  const visible = conversations.filter((conversation) => titleOf(conversation).toLowerCase().includes(search.trim().toLowerCase()))
  const sections = [
    { label: 'Channels', items: visible.filter((conversation) => conversation.kind === 'channel') },
    { label: 'Direct messages', items: visible.filter((conversation) => conversation.kind === 'dm') },
    { label: 'Groups', items: visible.filter((conversation) => conversation.kind === 'group') },
  ].filter((section) => section.items.length > 0)
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? visible[0] ?? conversations[0]

  return (
    <div className="flex h-[calc(100svh-3rem)] min-h-96 flex-col overflow-hidden bg-background lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b bg-muted/20 lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4 lg:h-14">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">Messages</h1>
            <p className="truncate text-xs text-muted-foreground">{team.name}</p>
          </div>
          <NewConversationDialog teamId={team.id} people={people} canCreateChannel={can.isAdmin} onCreated={(id) => {
              select(id)
              // The list, who is in what, and the unread counts; not every open conversation's messages. Its own echo is dropped.
              for (const table of ['conversations', 'conversation_members']) ownWrite(table, id)
              for (const part of ['conversations', 'members', 'unread']) void queryClient.invalidateQueries({ queryKey: ['messaging', part] })
            }} />
        </div>
        <label className="relative mx-2 mt-2 mb-1 block max-lg:hidden">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-muted-foreground" />
          <Input aria-label="Search conversations" className="h-7 bg-background pl-8 text-xs" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        {search.trim().length >= 2 && (
          <div className="mx-2 mb-2 max-h-48 overflow-y-auto rounded-md border bg-background p-1" aria-label="Message search results">
            {searchResults.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">No messages found.</p>
            ) : (
              searchResults.map((result) => {
                const where = conversations.find((conversation) => conversation.id === result.conversation_id)
                return (
                  <button key={result.id} type="button" className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted" onClick={() => { select(result.conversation_id, result.parent_id ?? result.id); setSearch('') }}>
                    {where && <span className="block truncate text-[10px] font-medium text-muted-foreground">{displayName(titleOf(where))}</span>}
                    <span className="block truncate text-xs">{result.content}</span>
                  </button>
                )
              })
            )}
          </div>
        )}
        <nav aria-label="Conversations" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:block lg:min-h-0 lg:flex-1 lg:space-y-4 lg:overflow-x-visible lg:overflow-y-auto lg:pt-2">
          {sections.map((section) => (
            <div key={section.label} className="flex gap-1 lg:block lg:space-y-0.5">
              <h3 className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase max-lg:hidden">{section.label}</h3>
              {section.items.map((conversation) => {
                const counts = unread.byConversation.get(conversation.id)
                return (
                  <ConversationItem
                    key={conversation.id}
                    kind={conversation.kind}
                    title={titleOf(conversation)}
                    profile={otherPerson(conversation)}
                    active={conversation.id === selected?.id}
                    unread={counts?.unread_count ?? 0}
                    mentions={counts?.mention_count ?? 0}
                    muted={unread.muted.has(conversation.id)}
                    onClick={() => select(conversation.id)}
                  />
                )
              })}
            </div>
          ))}
          {visible.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">No conversations found.</p>}
        </nav>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selected ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
            <ConversationView
              key={selected.id}
              conversationId={selected.id}
              kind={selected.kind}
              description={selected.description}
              teamId={team.id}
              teamSlug={team.slug}
              isGroup={selected.kind === 'group'}
              title={titleOf(selected)}
              muted={unread.muted.has(selected.id)}
              people={people}
              targetMessageId={targetMessageId}
              onTargetHandled={clearTarget}
            />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            <div><MessageCircle className="mx-auto mb-2 size-8" /><p>Select a conversation to start messaging.</p></div>
          </div>
        )}
      </section>
    </div>
  )
}
