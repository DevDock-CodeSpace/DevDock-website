import type { Query, QueryKey } from '@tanstack/react-query'
import { queryClient } from './query-client'
import { supabase } from './supabase'

// Live updates, like Linear: the database tells every open tab when a row
// changes (Supabase Realtime, filtered by RLS), and the queries that show that
// table are refetched. Changes made by other people, other tabs and the GitHub
// webhook all arrive this way. No row data is shown from the event itself; for
// messages its ids only pick which queries to refetch (see `messageQueries`).

type Change = { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }

const id = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/**
 * A chat message is the busiest change in the app, so it refetches only what it
 * can alter: a new message touches its conversation's timeline and the unread
 * counts, a new reply touches that conversation's threads (replies never count as
 * unread). Edits and deletes can show in either. The conversation list has no
 * column a message changes. Without the row (a hard delete, or one RLS hides) it
 * falls back to every message query.
 */
function messageQueries({ eventType, new: row }: Change): QueryKey[] {
  const conversation = id(row.conversation_id)
  if (!conversation) return [['messaging', 'messages'], ['messaging', 'thread'], ['messaging', 'thread-unread'], ['messaging', 'unread']]
  const team = id(row.team_id)
  const timeline: QueryKey[] = [['messaging', 'messages', conversation], team ? ['messaging', 'unread', team] : ['messaging', 'unread']]
  const threads: QueryKey[] = [['messaging', 'thread', conversation], ['messaging', 'thread-unread', conversation]]
  if (eventType !== 'INSERT') return [...timeline, ...threads]
  return row.parent_id == null ? timeline : threads
}

/**
 * The query-key prefixes each table shows up in (or a function of the change, for
 * tables busy enough to be worth narrowing). A table must also be in the
 * `supabase_realtime` publication (see the enable_realtime migration) to send events.
 */
const AFFECTS: Record<string, QueryKey[] | ((change: Change) => QueryKey[])> = {
  teams: [['teams']],
  team_members: [['teams'], ['workspaces']],
  workspaces: [['workspaces'], ['issues', 'team']],
  workspace_members: [['workspaces']],
  workspace_modules: [['workspaces']],
  workspace_pins: [['workspaces', 'pins']],
  documents: [['documents']],
  doc_folders: [['documents']],
  diagrams: [['diagrams']],
  issues: [['issues', 'workspace'], ['issues', 'team'], ['issues', 'detail'], ['issues', 'cycle-history']],
  issue_labels: [['issues', 'labels']],
  issue_label_links: [['issues', 'workspace'], ['issues', 'team'], ['issues', 'detail']],
  issue_comments: [['issues', 'comments']],
  issue_activity: [['issues', 'activity'], ['issues', 'cycle-history']],
  issue_cycles: [['issues', 'cycles']],
  issue_views: [['issues', 'views'], ['issues', 'pins']],
  issue_pins: [['issues', 'pins']],
  issue_pull_requests: [['issues', 'pull-requests']],
  issue_branches: [['issues', 'branches']],
  repos: [['repos', 'team'], ['repos', 'workspace']],
  workspace_repos: [['repos', 'team'], ['repos', 'workspace']],
  learning_modules: [['learning']],
  lessons: [['learning']],
  lesson_progress: [['learning', 'progress']],
  conversations: [['messaging', 'conversations']],
  conversation_members: [['messaging', 'conversations'], ['messaging', 'members'], ['messaging', 'unread']],
  messages: messageQueries,
  message_reactions: [['messaging', 'reactions']],
  message_pins: [['messaging', 'pins']],
  message_attachments: [['messaging', 'attachments']],
  conversation_reads: [['messaging', 'unread']],
  thread_reads: [['messaging', 'thread-unread']],
  conversation_preferences: [['messaging', 'preferences']],
  notifications: [['messaging', 'notifications']],
}

const BATCH_MS = 250

/** Signed image URLs don't change with the data; refetching them would reload every image. */
const isSignedUrl = (query: Query) => query.queryKey[0] === 'documents' && query.queryKey[1] === 'image'

const startsWith = (key: QueryKey, prefix: QueryKey) => prefix.every((part, i) => key[i] === part)

let channels = 0

/**
 * Subscribes to row changes until the returned function is called. Events are
 * batched, and wait while one of our own saves is running so a refetch can't
 * put an older value over an optimistic one.
 */
export function startRealtimeSync(): () => void {
  // Keyed by the serialized prefix, so a burst of events asks for each query once.
  const changed = new Map<string, QueryKey>()
  let timer: number | undefined
  let joined = false

  const flush = () => {
    if (queryClient.isMutating() > 0) {
      timer = window.setTimeout(flush, BATCH_MS)
      return
    }
    timer = undefined
    const prefixes = [...changed.values()]
    changed.clear()
    if (prefixes.length === 0) return
    void queryClient.invalidateQueries({
      predicate: (query) => !isSignedUrl(query) && prefixes.some((prefix) => startsWith(query.queryKey, prefix)),
    })
  }

  // A new topic each time: a topic that is still closing can't be subscribed again.
  const channel = supabase
    .channel(`db-changes-${++channels}`)
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      const affects = AFFECTS[payload.table]
      const prefixes = typeof affects === 'function' ? affects(payload as Change) : (affects ?? [])
      for (const prefix of prefixes) changed.set(JSON.stringify(prefix), prefix)
      if (changed.size > 0) timer ??= window.setTimeout(flush, BATCH_MS)
    })
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error('[realtime] Live updates are not connected', status, error)
      if (status !== 'SUBSCRIBED') return
      console.info('[realtime] Live updates connected')
      // Back after a dropped connection (sleep, offline): events were missed, so refresh everything.
      if (joined) void queryClient.invalidateQueries({ predicate: (query) => !isSignedUrl(query) })
      joined = true
    })

  return () => {
    window.clearTimeout(timer)
    void supabase.removeChannel(channel)
  }
}
