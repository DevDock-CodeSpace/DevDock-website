import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { errorMessage } from '@/lib/errors'
import type { Json } from '@/types/database.types'
import {
  conversationKeys,
  preferencesQuery,
  sendMessage,
  setNotificationMode,
  unreadCountsQuery,
  uploadMessageAttachment,
  type Message,
  type NotificationMode,
} from './api'
import { pendingMessageId } from './names'

export type SendInput = { clientId: string; content: string; body: Json; mentionIds: string[]; files: File[] }

/**
 * Sends to the main timeline and shows the message at once (greyed, "Sending…")
 * until the server has it. `limit` is the message window the page currently shows.
 */
export function useSendMessage(conversationId: string, teamId: string, limit: number) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const key = conversationKeys.messages(conversationId, limit)
  return useMutation({
    mutationFn: async (input: SendInput) => {
      const message = await sendMessage({ conversationId, clientId: input.clientId, content: input.content, body: input.body, mentionIds: input.mentionIds })
      for (const file of input.files) await uploadMessageAttachment({ teamId, conversationId, messageId: message.id, file })
      return message
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.messages(conversationId) })
      const previous = queryClient.getQueryData<Message[]>(key)
      const pending: Message = {
        id: pendingMessageId(input.clientId),
        conversation_id: conversationId,
        team_id: teamId,
        author_id: user.id,
        parent_id: null,
        client_id: input.clientId,
        body: input.body,
        content: input.content,
        edited_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
      }
      queryClient.setQueryData<Message[]>(key, (current) => [...(current ?? []), pending])
      return { previous }
    },
    onError: (error, _input, context) => {
      queryClient.setQueryData(key, context?.previous)
      toast.error(errorMessage(error))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) })
      void queryClient.invalidateQueries({ queryKey: conversationKeys.attachments(conversationId) })
    },
  })
}

/** Unread and mention counts per conversation, plus which conversations are muted. */
export function useUnread(teamId: string) {
  const counts = useQuery(unreadCountsQuery(teamId)).data
  const preferences = useQuery(preferencesQuery()).data
  return useMemo(() => {
    const muted = new Set((preferences ?? []).filter((row) => row.notification_mode === 'muted').map((row) => row.conversation_id))
    const byConversation = new Map((counts ?? []).map((row) => [row.conversation_id, row]))
    // Muted conversations keep their own count but don't add to the sidebar badge.
    const total = (counts ?? []).reduce((sum, row) => (muted.has(row.conversation_id) ? sum : sum + row.unread_count), 0)
    return { byConversation, muted, total }
  }, [counts, preferences])
}

export function useSetNotificationMode(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mode: NotificationMode) => setNotificationMode(conversationId, mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationKeys.preferences }),
    onError: (error) => toast.error(errorMessage(error)),
  })
}

/** Sends a thread reply (with mentions and files) and refreshes the thread. */
export function useSendReply(conversationId: string, teamId: string, parentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<SendInput, 'clientId'> & { clientId: string }) => {
      const message = await sendMessage({ conversationId, parentId, clientId: input.clientId, content: input.content, body: input.body, mentionIds: input.mentionIds })
      for (const file of input.files) await uploadMessageAttachment({ teamId, conversationId, messageId: message.id, file })
      return message
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.replies(conversationId) })
      void queryClient.invalidateQueries({ queryKey: conversationKeys.attachments(conversationId) })
    },
  })
}
