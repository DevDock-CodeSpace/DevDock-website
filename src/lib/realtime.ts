import type { Query, QueryKey } from '@tanstack/react-query'
import { queryClient } from './query-client'
import { supabase } from './supabase'

// Live updates, like Linear: the database tells every open tab when a row
// changes (Supabase Realtime, filtered by RLS), and the queries that show that
// table are refetched. Changes made by other people, other tabs and the GitHub
// webhook all arrive this way. No row data is taken from the event itself.

/**
 * The query-key prefixes each table shows up in. A table must also be in the
 * `supabase_realtime` publication (see the enable_realtime migration) to send events.
 */
const AFFECTS: Record<string, QueryKey[]> = {
  teams: [['teams']],
  team_members: [['teams'], ['workspaces']],
  workspaces: [['workspaces'], ['issues', 'team']],
  workspace_members: [['workspaces']],
  workspace_modules: [['workspaces']],
  workspace_pins: [['workspaces', 'pins']],
  documents: [['documents']],
  doc_folders: [['documents']],
  diagrams: [['diagrams']],
  issues: [['issues', 'workspace'], ['issues', 'team'], ['issues', 'detail']],
  issue_labels: [['issues', 'labels']],
  issue_label_links: [['issues', 'workspace'], ['issues', 'team'], ['issues', 'detail']],
  issue_comments: [['issues', 'comments']],
  issue_activity: [['issues', 'activity']],
  issue_cycles: [['issues', 'cycles']],
  issue_pull_requests: [['issues', 'pull-requests']],
  issue_branches: [['issues', 'branches']],
  repos: [['repos', 'team'], ['repos', 'workspace']],
  workspace_repos: [['repos', 'team'], ['repos', 'workspace']],
  learning_modules: [['learning']],
  lessons: [['learning']],
  lesson_progress: [['learning', 'progress']],
  conversations: [['messaging', 'conversations']],
  conversation_members: [['messaging', 'conversations'], ['messaging', 'members']],
  messages: [['messaging', 'conversations'], ['messaging', 'messages']],
  message_reactions: [['messaging', 'messages']],
  message_pins: [['messaging', 'messages']],
  conversation_reads: [['messaging', 'reads']],
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
  const changed = new Set<string>()
  let timer: number | undefined
  let joined = false

  const flush = () => {
    if (queryClient.isMutating() > 0) {
      timer = window.setTimeout(flush, BATCH_MS)
      return
    }
    timer = undefined
    const prefixes = [...changed].flatMap((table) => AFFECTS[table] ?? [])
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
      changed.add(payload.table)
      timer ??= window.setTimeout(flush, BATCH_MS)
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
