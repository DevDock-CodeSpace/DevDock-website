// Messaging: find a conversation, and send a message (always confirmed
// first). Reads are the Messages page's own queries; the send goes through
// the same RPCs the composer uses, so membership rules are the database's.

import type { AiExecutionContext, AiToolResult } from '../agent/types.ts'
import { loadPeople, type Person } from './people.ts'
import { defineTool } from './registry.ts'
import { bestMatches, dbFailure, fail, ok, textToDoc } from './shared.ts'

/** Shorter than the composer's limit: this is for notes, not documents. */
const MAX_MESSAGE = 4000

type Conversation = { id: string; kind: string; title: string; memberIds: string[] }

/** As conversationTitle() in src/features/messaging/names.ts. */
function titleOf(kind: string, name: string | null, memberIds: string[], people: Person[], me: string) {
  if (kind === 'channel') return `#${name ?? 'channel'}`
  if (kind === 'group') return name ?? 'Group conversation'
  const other = memberIds.find((id) => id !== me)
  return people.find((p) => p.id === other)?.name ?? 'Direct message'
}

/** Conversations the caller can read in the group (RLS): channels, and the DMs and groups they are in. */
async function loadConversations(context: AiExecutionContext): Promise<AiToolResult<{ conversations: Conversation[]; people: Person[] }>> {
  const [conversations, members, people] = await Promise.all([
    context.db.from('conversations').select('id, kind, name').eq('team_id', context.teamId).eq('is_archived', false).limit(300),
    context.db.from('conversation_members').select('conversation_id, user_id').eq('team_id', context.teamId).is('left_at', null).limit(3000),
    loadPeople(context),
  ])
  if (conversations.error) return dbFailure('load conversations', conversations.error)
  if (members.error) return dbFailure('load conversations', members.error)
  if (!people.success) return people
  const byConversation = new Map<string, string[]>()
  for (const row of members.data as { conversation_id: string; user_id: string }[]) {
    byConversation.set(row.conversation_id, [...(byConversation.get(row.conversation_id) ?? []), row.user_id])
  }
  return ok({
    people: people.data,
    conversations: (conversations.data as { id: string; kind: string; name: string | null }[]).map((c) => {
      const memberIds = byConversation.get(c.id) ?? []
      return { id: c.id, kind: c.kind, memberIds, title: titleOf(c.kind, c.name, memberIds, people.data, context.userId) }
    }),
  })
}

type SendArgs = { conversationId?: string; recipientUserId?: string; text: string }

/** Who a message would go to, checked under the caller's RLS. Changes nothing. */
async function resolveTarget(args: SendArgs, context: AiExecutionContext): Promise<AiToolResult<{ title: string; kind: string }>> {
  if (Boolean(args.conversationId) === Boolean(args.recipientUserId)) {
    return fail('INVALID_ARGUMENTS', 'Give either conversationId or recipientUserId, not both.')
  }
  if (args.recipientUserId) {
    if (args.recipientUserId === context.userId) return fail('NOT_ALLOWED', 'You can’t send a direct message to yourself.')
    const people = await loadPeople(context)
    if (!people.success) return people
    const person = people.data.find((p) => p.id === args.recipientUserId)
    return person ? ok({ title: person.name, kind: 'dm' }) : fail('NOT_FOUND', 'That person isn’t in this group.')
  }
  const loaded = await loadConversations(context)
  if (!loaded.success) return loaded
  const conversation = loaded.data.conversations.find((c) => c.id === args.conversationId)
  return conversation
    ? ok({ title: conversation.title, kind: conversation.kind })
    : fail('NOT_FOUND', 'That conversation doesn’t exist, is archived, or you aren’t in it.')
}

export const messagingTools = [
  defineTool<{ query?: string; withUserId?: string; kind?: 'channel' | 'dm' | 'group' }>({
    name: 'find_conversation',
    description:
      'Find conversations the user can read: channels (like #general), direct messages and group chats. ' +
      'Search by name with query, or by a person with withUserId (an id from find_user). Returns ids and titles, never messages.',
    domain: 'messaging',
    capability: 'search',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A channel or group name, e.g. "general" or "frontend".', maxLength: 80 },
        withUserId: { type: 'string', format: 'uuid', description: 'Conversations that include this person.' },
        kind: { type: 'string', enum: ['channel', 'dm', 'group'] },
      },
    },
    async execute(args, context) {
      const loaded = await loadConversations(context)
      if (!loaded.success) return loaded
      const { people } = loaded.data
      let found = loaded.data.conversations
      if (args.kind) found = found.filter((c) => c.kind === args.kind)
      if (args.withUserId) {
        const person = args.withUserId
        found = found.filter((c) => c.kind !== 'channel' && c.memberIds.includes(person))
      }
      if (args.query) found = bestMatches(found, args.query.replace(/^#\s*/, ''), (c) => c.title.replace(/^#/, ''))
      // A direct message is the likeliest answer to "my conversation with Sree".
      const rank = (c: Conversation) => (c.kind === 'dm' ? 0 : c.kind === 'group' ? 1 : 2)
      found = [...found].sort((a, b) => rank(a) - rank(b))

      const noDm = args.withUserId && !found.some((c) => c.kind === 'dm')
      return ok({
        conversations: found.slice(0, 10).map((c) => ({
          id: c.id,
          kind: c.kind === 'dm' ? 'direct message' : c.kind,
          title: c.title,
          ...(c.kind === 'group' ? { people: c.memberIds.slice(0, 8).map((id) => people.find((p) => p.id === id)?.name ?? 'Unnamed member') } : {}),
        })),
        ...(found.length > 10 ? { more: found.length - 10 } : {}),
        ...(noDm ? { note: 'There is no direct message with this person yet. send_message with recipientUserId starts one.' } : {}),
      })
    },
  }),

  defineTool<SendArgs>({
    name: 'send_message',
    description:
      'Send a DevDock message as the user. To message a person directly, pass recipientUserId (an id from find_user); ' +
      'to post in a channel or group chat, pass conversationId (from find_conversation). Write the text as the user would say it, in the first person. ' +
      'This does not send at once: the user is shown the message and must confirm, so never say it was sent.',
    domain: 'messaging',
    capability: 'send',
    risk: 'external',
    inputSchema: {
      type: 'object',
      properties: {
        recipientUserId: { type: 'string', format: 'uuid', description: 'The person to message directly.' },
        conversationId: { type: 'string', format: 'uuid', description: 'A channel or group chat to post in.' },
        text: { type: 'string', description: 'The message, plain text.', minLength: 1, maxLength: MAX_MESSAGE },
      },
      required: ['text'],
    },
    editable: [{ name: 'text', label: 'Message', maxLength: MAX_MESSAGE }],
    async prepare(args, context) {
      const target = await resolveTarget(args, context)
      if (!target.success) return target
      const { title, kind } = target.data
      return ok({
        args,
        preview: {
          title: `Send to ${title}`,
          body: args.text,
          fields: [{ label: 'To', value: kind === 'dm' ? `${title} (direct message)` : title }],
          confirmLabel: 'Send',
        },
      })
    },
    async execute(args, context) {
      // Only the confirmation flow sets the key; without it this was not confirmed.
      if (!context.idempotencyKey) return fail('NOT_ALLOWED', 'A message needs the user’s confirmation first.')
      const target = await resolveTarget(args, context)
      if (!target.success) return target

      let conversationId = args.conversationId
      if (args.recipientUserId) {
        // Returns the existing direct message or starts one, exactly as the "New message" dialog does.
        const { data, error } = await context.db.rpc('create_direct_conversation', { p_team_id: context.teamId, p_user_id: args.recipientUserId })
        if (error) return dbFailure('start the direct message', error)
        conversationId = data as string
      }
      // client_id makes the send idempotent in the database: the same action can never post twice.
      const { error } = await context.db.rpc('send_message', {
        p_conversation_id: conversationId,
        p_client_id: context.idempotencyKey,
        p_body: textToDoc(args.text),
        p_content: args.text,
        p_mention_ids: [],
      })
      if (error) return dbFailure('send the message', error, { '42501': { code: 'PERMISSION_DENIED', message: 'You can’t post in that conversation.' } })
      return ok({ sent: true, to: target.data.title })
    },
    confirmedMessage: (data) => `Sent to ${(data as { to: string }).to}.`,
  }),
]
