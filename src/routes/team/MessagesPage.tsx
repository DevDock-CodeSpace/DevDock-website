import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Bell, ChevronDown, ChevronRight, Hash, LoaderCircle, MessageCircle, Paperclip, Pencil, Pin, Plus, Reply, Search, Send, Trash2, Users, X } from 'lucide-react'
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/hooks'
import { teamMembersQuery, type TeamMember } from '@/features/teams/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import { teamDocsQuery } from '@/features/docs/api'
import { teamDiagramsQuery } from '@/features/diagrams/api'
import { teamLiveSessionsQuery } from '@/features/live/api'
import { teamIssuesQuery } from '@/features/issues/api'
import { diagramPath, docPath, issuePath, liveSessionPath } from '@/features/teams/nav'
import { errorMessage } from '@/lib/errors'
import {
  conversationKeys,
  conversationMembersQuery,
  addGroupMember,
  createSignedAttachmentUrl,
  createChannel,
  createDirectConversation,
  createGroupConversation,
  findExistingGroup,
  markNotificationRead,
  markConversationRead,
  messageAttachmentsQuery,
  uploadMessageAttachment,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_ATTACHMENT_TYPES,
  messagesQuery,
  searchMessagesQuery,
  notificationsQuery,
  pinsQuery,
  reactionsQuery,
  threadMessagesQuery,
  sendMessage,
  teamConversationMembersQuery,
  teamConversationsQuery,
  togglePin,
  toggleReaction,
  updateMessage,
  deleteMessage,
  type Message,
  type ConversationKind,
} from '@/features/messaging/api'

const MESSAGE_REACTIONS = ['👍', '🎉', '✅', '🙌', '💯', '❌', '😤', '❤️']

export function MessagesPage() {
  const { team, can } = useCurrentTeam()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const conversations = useSuspenseQuery(teamConversationsQuery(team.id)).data
  const people = useSuspenseQuery(teamMembersQuery(team.id)).data
  const conversationMembers = useSuspenseQuery(teamConversationMembersQuery(team.id)).data
  const notifications = useSuspenseQuery(notificationsQuery(team.id, user.id)).data
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | undefined>(conversations[0]?.id)
  const searchResults = useQuery(searchMessagesQuery(team.id, search)).data ?? []
  const visible = conversations.filter((conversation) => {
    const label = conversationTitle(
      conversation.kind,
      conversation.name,
      people,
      user.id,
      conversationMembers.filter((member) => member.conversation_id === conversation.id).map((member) => member.user_id),
    )
    return label.toLowerCase().includes(search.trim().toLowerCase())
  })
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? visible[0] ?? conversations[0]

  const refresh = () => queryClient.invalidateQueries({ queryKey: conversationKeys.all })

  return (
    <div className="flex min-h-[calc(100svh-9rem)] flex-col overflow-hidden rounded-lg border bg-background lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b lg:w-72 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <div>
            <h1 className="text-sm font-semibold">Messages</h1>
            <p className="text-xs text-muted-foreground">{team.name}</p>
          </div>
          <NewConversationDialog teamId={team.id} people={people} canCreateChannel={can.isAdmin} onCreated={(id) => { setSelectedId(id); void refresh() }} />
        </div>
        <label className="relative m-3 block">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Search conversations" className="pl-8" placeholder="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        {search.trim().length >= 2 && <div className="mx-3 mb-2 max-h-40 space-y-1 overflow-y-auto rounded border p-1" aria-label="Message search results">{searchResults.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">No messages found.</p> : searchResults.map((result) => <button key={result.id} type="button" className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => { setSelectedId(result.conversation_id); setSearch('') }}>{result.content}</button>)}</div>}
        <NotificationList
          notifications={notifications}
          conversations={conversations}
          people={people}
          currentUserId={user.id}
          onSelect={async (conversationId, notificationId) => {
            await markNotificationRead(notificationId)
            setSelectedId(conversationId)
            await queryClient.invalidateQueries({ queryKey: conversationKeys.notifications(team.id, user.id) })
          }}
        />
        <nav aria-label="Conversations" className="flex gap-1 overflow-x-auto p-2 lg:block lg:overflow-y-auto">
          {visible.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === selected?.id}
              title={conversationTitle(
                conversation.kind,
                conversation.name,
                people,
                user.id,
                conversationMembers.filter((member) => member.conversation_id === conversation.id).map((member) => member.user_id),
              )}
              onClick={() => setSelectedId(conversation.id)}
            />
          ))}
          {visible.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">No conversations found.</p>}
        </nav>
      </aside>
      <section className="flex min-h-[32rem] min-w-0 flex-1 flex-col">
        {selected ? <ConversationView conversationId={selected.id} teamId={team.id} teamSlug={team.slug} isGroup={selected.kind === 'group'} title={conversationTitle(selected.kind, selected.name, people, user.id, conversationMembers.filter((member) => member.conversation_id === selected.id).map((member) => member.user_id))} people={people} /> : <EmptyMessages />}
      </section>
    </div>
  )
}

function ConversationView({ conversationId, teamId, teamSlug, isGroup, title, people }: { conversationId: string; teamId: string; teamSlug: string; isGroup: boolean; title: string; people: TeamMember[] }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const messages = useSuspenseQuery(messagesQuery(conversationId)).data
  const members = useSuspenseQuery(conversationMembersQuery(conversationId)).data
  const pins = useSuspenseQuery(pinsQuery(conversationId)).data
  const [draft, setDraft] = useState(() => window.sessionStorage.getItem(`devdock-message-draft:${conversationId}`) ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const [mentioning, setMentioning] = useState(false)
  const send = useMutation({
    mutationFn: async () => {
      const message = await sendMessage({ conversationId, clientId: crypto.randomUUID(), content: draft || 'Shared files', mentionIds })
      for (const file of files) await uploadMessageAttachment({ teamId, conversationId, messageId: message.id, file })
      return message
    },
    onSuccess: () => {
      setDraft('')
      setFiles([])
      setMentionIds([])
      window.sessionStorage.removeItem(`devdock-message-draft:${conversationId}`)
      void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  useEffect(() => {
    window.sessionStorage.setItem(`devdock-message-draft:${conversationId}`, draft)
  }, [conversationId, draft])

  useEffect(() => {
    const latest = messages.at(-1)
    if (latest) void markConversationRead(conversationId, latest.id)
  }, [conversationId, messages])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    submitMessage()
  }

  const submitMessage = () => {
    if ((draft.trim() || files.length > 0) && !send.isPending) send.mutate()
  }

  const chooseMention = (person: TeamMember) => {
    const at = draft.lastIndexOf('@')
    const name = person.profile?.display_name ?? 'member'
    setDraft(`${draft.slice(0, at)}@${name} `)
    setMentionIds((current) => current.includes(person.user_id) ? current : [...current, person.user_id])
    setMentioning(false)
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submitMessage()
    }
  }

  return (
    <>
      <header className="flex min-h-14 items-center gap-2 border-b px-4">
        <Hash className="size-4 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{members.length} participant{members.length === 1 ? '' : 's'}</p>
        </div>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-4" />
          <span className="sr-only">Participants</span>
          {members.length}
        </div>
        {isGroup && <AddGroupMemberDialog conversationId={conversationId} members={members} people={people} onAdded={() => { void queryClient.invalidateQueries({ queryKey: conversationKeys.members(conversationId) }); void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) }) }} />}
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-48 items-center justify-center text-center text-sm text-muted-foreground">Start the conversation.</div>
        ) : (
          <div className="space-y-5">
            {messages.map((message) => <MessageItem key={message.id} message={message} conversationId={conversationId} teamId={message.team_id} people={people} currentUserId={user.id} pinned={pins.some((pin) => pin.message_id === message.id)} />)}
          </div>
        )}
      </div>
      <form onSubmit={submit} className="border-t p-3">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            {mentioning && <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto rounded border bg-background p-1">{members.filter((member) => member.user_id !== user.id).map((member) => { const person = people.find((item) => item.user_id === member.user_id); return person ? <Button key={person.user_id} type="button" variant="ghost" size="xs" onClick={() => chooseMention(person)}>{person.profile?.display_name ?? 'Unnamed member'}</Button> : null })}</div>}
            <Textarea aria-label={`Message ${title}`} value={draft} onChange={(event) => { setDraft(event.target.value); setMentioning(event.target.value.slice(event.target.value.lastIndexOf(' ') + 1).startsWith('@')) }} onKeyDown={handleComposerKeyDown} placeholder={`Message ${title}`} rows={2} maxLength={20_000} className="min-h-10 resize-none" />
            {files.length > 0 && <div className="flex flex-wrap gap-1">{files.map((file) => <span key={`${file.name}-${file.size}`} className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs">{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item !== file))}><X className="size-3" /></button></span>)}</div>}
          </div>
          <input id={`message-files-${conversationId}`} type="file" multiple accept={MESSAGE_ATTACHMENT_TYPES.join(',')} className="hidden" onChange={(event) => { const next = Array.from(event.target.files ?? []); if (next.length > 5 || next.some((file) => file.size > MESSAGE_ATTACHMENT_MAX_BYTES || !(MESSAGE_ATTACHMENT_TYPES as readonly string[]).includes(file.type))) { toast.error('Choose up to five supported files, each no larger than 10 MB.'); return } setFiles(next) }} />
          <ResourceAttachmentMenu teamId={teamId} teamSlug={teamSlug} onFiles={setFiles} onLink={(url) => setDraft((current) => `${current}${current ? '\n' : ''}${url} `)} />
          <Button type="submit" size="icon" aria-label="Send message" disabled={(!draft.trim() && files.length === 0) || send.isPending}>
            {send.isPending ? <LoaderCircle className="animate-spin" /> : <Send />}
          </Button>
        </div>
        {send.isError && <p role="alert" className="mt-2 text-xs text-destructive">{send.error.message} Send again to retry.</p>}
      </form>
    </>
  )
}

function MessageItem({ message, conversationId, teamId, people, currentUserId, pinned }: { message: Message; conversationId: string; teamId: string; people: TeamMember[]; currentUserId: string; pinned: boolean }) {
  const queryClient = useQueryClient()
  const reactions = useSuspenseQuery(reactionsQuery(message.id)).data
  const attachments = useSuspenseQuery(messageAttachmentsQuery(message.id)).data
  const replies = useSuspenseQuery(threadMessagesQuery(conversationId, message.id)).data
  const [threadOpen, setThreadOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const edit = useMutation({ mutationFn: () => updateMessage(message.id, editText, { type: 'doc', content: [{ type: 'paragraph', content: editText ? [{ type: 'text', text: editText }] : undefined }] }), onSuccess: () => { setEditing(false); void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) }) }, onError: (error) => toast.error(errorMessage(error)) })
  const remove = useMutation({ mutationFn: () => deleteMessage(message.id), onSuccess: () => void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) }), onError: (error) => toast.error(errorMessage(error)) })
  const react = useMutation({ mutationFn: ({ emoji, active }: { emoji: string; active: boolean }) => toggleReaction({ messageId: message.id, conversationId, teamId, userId: currentUserId, emoji, active }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['messaging', 'reactions', message.id] }), onError: (error) => toast.error(errorMessage(error)) })
  const pin = useMutation({ mutationFn: () => togglePin({ messageId: message.id, conversationId, teamId, active: pinned }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['messaging', 'pins', conversationId] }), onError: (error) => toast.error(errorMessage(error)) })
  const mine = message.author_id === currentUserId
  const name = mine ? 'You' : authorName(message.author_id, people)
  return (
    <article className="group flex gap-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{authorInitial(name)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><span className="text-sm font-medium">{name}</span><time className="text-xs text-muted-foreground" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>{message.edited_at && <span className="text-xs text-muted-foreground">(edited)</span>}</div>
        {editing ? <div className="flex gap-2"><Textarea value={editText} onChange={(event) => setEditText(event.target.value)} rows={2} /><Button size="sm" onClick={() => edit.mutate()} disabled={!editText.trim() || edit.isPending}>Save</Button></div> : <MessageContent content={message.deleted_at ? 'This message was deleted.' : message.content} />}
        {attachments.length > 0 && <div className="mt-2 space-y-1">{attachments.map((attachment) => <AttachmentItem key={attachment.id} attachment={attachment} />)}</div>}
        {!message.deleted_at && <div className="mt-1 flex flex-wrap items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">{MESSAGE_REACTIONS.map((emoji) => { const count = reactions.filter((reaction) => reaction.emoji === emoji).length; const active = reactions.some((reaction) => reaction.user_id === currentUserId && reaction.emoji === emoji); return <Button key={emoji} variant={active ? 'secondary' : 'ghost'} size="xs" onClick={() => react.mutate({ emoji, active })} aria-label={`Toggle ${emoji} reaction`}>{emoji}{count > 0 ? ` ${count}` : ''}</Button> })}<Button variant="ghost" size="xs" onClick={() => setThreadOpen((open) => !open)}>{replies.length > 0 ? <><Reply /> View replies ({replies.length})</> : <><Reply /> Reply</>}</Button><Button variant="ghost" size="xs" onClick={() => pin.mutate()} aria-label={pinned ? 'Unpin message' : 'Pin message'}><Pin className={pinned ? 'fill-current' : undefined} /></Button>{mine && <><Button variant="ghost" size="xs" onClick={() => setEditing(true)} aria-label="Edit message"><Pencil /></Button><Button variant="ghost" size="xs" onClick={() => remove.mutate()} aria-label="Delete message"><Trash2 /></Button></>}</div>}
        {threadOpen && <ThreadReplyBox conversationId={conversationId} parentId={message.id} replies={replies} people={people} currentUserId={currentUserId} />}
      </div>
    </article>
  )
}

function AttachmentItem({ attachment }: { attachment: { storage_path: string; file_name: string; file_size: number; mime_type: string } }) {
  const [loading, setLoading] = useState(false)
  const open = async () => {
    setLoading(true)
    try {
      const url = await createSignedAttachmentUrl(attachment.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }
  return <button type="button" onClick={() => void open()} disabled={loading} className="flex max-w-full items-center gap-2 rounded border px-2 py-1 text-left text-xs hover:bg-muted"><Paperclip className="size-3.5 shrink-0" /><span className="min-w-0 truncate">{attachment.file_name}</span><span className="shrink-0 text-muted-foreground">{formatFileSize(attachment.file_size)}</span></button>
}

function ResourceAttachmentMenu({ teamId, teamSlug, onFiles, onLink }: { teamId: string; teamSlug: string; onFiles: (files: File[]) => void; onLink: (url: string) => void }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<'Docs' | 'Diagrams' | 'Sessions' | 'Issues'>('Docs')
  const [selected, setSelected] = useState<{ id: string; label: string; href: string }[]>([])
  const docs = useQuery({ ...teamDocsQuery(teamId), enabled: open }).data ?? []
  const diagrams = useQuery({ ...teamDiagramsQuery(teamId), enabled: open }).data ?? []
  const live = useQuery({ ...teamLiveSessionsQuery(teamId), enabled: open }).data ?? []
  const issues = useQuery({ ...teamIssuesQuery(teamId), enabled: open }).data ?? []
  const addFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 5 || files.some((file) => file.size > MESSAGE_ATTACHMENT_MAX_BYTES || !(MESSAGE_ATTACHMENT_TYPES as readonly string[]).includes(file.type))) {
      toast.error('Choose up to five supported files, each no larger than 10 MB.')
    } else {
      onFiles(files)
      setOpen(false)
    }
    event.target.value = ''
  }
  const resources = category === 'Docs'
    ? docs.map((doc) => ({ id: doc.id, label: doc.title, href: docPath(teamSlug, doc.id, doc.workspace_id ?? undefined) }))
    : category === 'Diagrams'
      ? diagrams.map((diagram) => ({ id: diagram.id, label: diagram.title, href: diagramPath(teamSlug, diagram.id, diagram.workspace_id ?? undefined) }))
      : category === 'Sessions'
        ? live.map((session) => ({ id: session.id, label: session.title, href: liveSessionPath(teamSlug, session.id, session.workspace_id ?? undefined) }))
        : issues.map((issue) => ({ id: issue.id, label: `${issue.workspace.issue_key}-${issue.number} ${issue.title}`, href: issuePath(teamSlug, issue.workspace.id, issue.number) }))
  const toggle = (resource: { id: string; label: string; href: string }) => setSelected((current) => current.some((item) => item.id === resource.id) ? current.filter((item) => item.id !== resource.id) : [...current, resource])
  const shareSelected = () => {
    if (selected.length === 0) return
    onLink(selected.map((item) => `[${item.label}](${window.location.origin}${item.href})`).join('\n'))
    setSelected([])
    setOpen(false)
  }
  return <div className="relative"><Button type="button" variant="ghost" size="icon" aria-label="Attach a file or DevDock resource" onClick={() => setOpen((current) => !current)}><Paperclip /></Button>{open && <div className="absolute right-0 bottom-full z-20 mb-2 w-80 rounded-md border bg-popover p-2 text-popover-foreground shadow-md" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); shareSelected() } }}><label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"><Paperclip className="size-4" />Upload local files<input type="file" multiple accept={MESSAGE_ATTACHMENT_TYPES.join(',')} className="hidden" onChange={addFiles} /></label><div className="mt-2 grid grid-cols-4 gap-1 border-b pb-2">{(['Docs', 'Diagrams', 'Sessions', 'Issues'] as const).map((item) => <button key={item} type="button" className={`rounded px-1 py-1 text-xs ${category === item ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-muted'}`} onClick={() => setCategory(item)}>{item}</button>)}</div><p className="px-1 pt-2 text-xs font-medium text-muted-foreground">Select resources to share</p><div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">{resources.length === 0 ? <p className="px-1 py-3 text-xs text-muted-foreground">No accessible {category.toLowerCase()} found.</p> : resources.map((resource) => <button key={resource.id} type="button" className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${selected.some((item) => item.id === resource.id) ? 'bg-accent' : ''}`} onClick={() => toggle(resource)}><span className="size-3 rounded border">{selected.some((item) => item.id === resource.id) ? '✓' : ''}</span><span className="truncate">{resource.label}</span></button>)}</div><div className="mt-2 flex items-center justify-between border-t pt-2"><span className="text-xs text-muted-foreground">{selected.length} selected</span><Button type="button" size="xs" onClick={shareSelected} disabled={selected.length === 0}>Press Enter to share</Button></div></div>}</div>
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s<]+)/g)
  return <p className="whitespace-pre-wrap break-words text-sm">{parts.map((part, index) => {
    const markdown = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
    if (markdown) return <a key={`${part}-${index}`} href={markdown[2]} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">{markdown[1]}</a>
    if (!/^https?:\/\//.test(part)) return <span key={`${part}-${index}`}>{part}</span>
    let href = part
    let trailing = ''
    while (/[),.!?]$/.test(href)) {
      trailing = href.slice(-1) + trailing
      href = href.slice(0, -1)
    }
    return <span key={`${part}-${index}`}><a href={href} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">{href}</a>{trailing}</span>
  })}</p>
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ThreadReplyBox({ conversationId, parentId, replies, people, currentUserId }: { conversationId: string; parentId: string; replies: Message[]; people: TeamMember[]; currentUserId: string }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const send = useMutation({ mutationFn: () => sendMessage({ conversationId, parentId, clientId: crypto.randomUUID(), content: text }), onSuccess: () => { setText(''); void queryClient.invalidateQueries({ queryKey: ['messaging', 'thread', conversationId, parentId] }) }, onError: (error) => toast.error(errorMessage(error)) })
  return <div className="mt-3 border-l-2 pl-3"><div className="space-y-2">{replies.map((reply) => <div key={reply.id} className="text-sm"><strong>{reply.author_id === currentUserId ? 'You' : authorName(reply.author_id, people)}</strong><span className="ml-2 whitespace-pre-wrap">{reply.deleted_at ? 'This message was deleted.' : reply.content}</span></div>)}</div><div className="mt-2 flex gap-2"><Input aria-label="Reply in thread" value={text} onChange={(event) => setText(event.target.value)} placeholder="Reply in thread" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (text.trim()) send.mutate() } }} /><Button size="sm" onClick={() => send.mutate()} disabled={!text.trim() || send.isPending}>Reply</Button></div></div>
}

function NewConversationDialog({ teamId, people, canCreateChannel, onCreated }: { teamId: string; people: TeamMember[]; canCreateChannel: boolean; onCreated: (id: string) => void }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ConversationKind>('dm')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [existingGroupId, setExistingGroupId] = useState<string | null>(null)
  const [checkingGroup, setCheckingGroup] = useState(false)
  const create = useMutation({
    mutationFn: async () => {
      if (kind === 'channel') return createChannel(teamId, name, description)
      if (kind === 'group') return createGroupConversation(teamId, name, [user.id, ...selected.filter((id) => id !== user.id)])
      const target = selected[0]
      if (!target) throw new Error('Choose a group member.')
      return createDirectConversation(teamId, target)
    },
    onSuccess: (id) => { onCreated(id); setOpen(false); setName(''); setDescription(''); setSelected([]) },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const candidates = people.filter((person) => person.user_id !== user.id)
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  const startCreate = async () => {
    if (kind !== 'group') {
      create.mutate()
      return
    }
    setCheckingGroup(true)
    try {
      const existing = await findExistingGroup(teamId, [user.id, ...selected])
      if (existing) setExistingGroupId(existing)
      else create.mutate()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setCheckingGroup(false)
    }
  }
  const finishWithExisting = () => {
    if (!existingGroupId) return
    onCreated(existingGroupId)
    setExistingGroupId(null)
    setOpen(false)
    setSelected([])
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon-sm" aria-label="New conversation" title="New conversation"><Plus /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New conversation</DialogTitle><DialogDescription>Private messages are visible only to their participants.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
            {(['dm', 'group', ...(canCreateChannel ? ['channel' as const] : [])] as ConversationKind[]).map((option) => <Button key={option} type="button" size="sm" variant={kind === option ? 'secondary' : 'ghost'} onClick={() => { setKind(option); setSelected([]) }}>{option === 'dm' ? 'Direct' : option === 'group' ? 'Group' : 'Channel'}</Button>)}
          </div>
          {kind !== 'dm' && <><Label htmlFor="conversation-name">{kind === 'channel' ? 'Channel name' : 'Group name'}</Label><Input id="conversation-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder={kind === 'channel' ? 'announcements' : 'Study partners'} required /></>}
          {kind === 'channel' && <><Label htmlFor="conversation-description">Description</Label><Textarea id="conversation-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={2} /></>}
          <div className="space-y-2"><Label>{kind === 'dm' ? 'Person' : 'Participants'}</Label>{candidates.map((person) => <label key={person.user_id} className="flex items-center gap-2 text-sm"><input type={kind === 'dm' ? 'radio' : 'checkbox'} name="conversation-person" checked={selected.includes(person.user_id)} onChange={() => kind === 'dm' ? setSelected([person.user_id]) : toggle(person.user_id)} />{person.profile?.display_name ?? 'Unnamed member'}</label>)}</div>
        </div>
        <DialogFooter><Button onClick={startCreate} disabled={create.isPending || checkingGroup || (kind === 'dm' ? selected.length !== 1 : !name.trim() || (kind === 'group' && selected.length === 0))}>{(create.isPending || checkingGroup) && <LoaderCircle className="animate-spin" />}Create</Button></DialogFooter>
      </DialogContent>
      <Dialog open={existingGroupId !== null} onOpenChange={(next) => { if (!next) setExistingGroupId(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>This group already exists</DialogTitle><DialogDescription>A group with the same participants is already in this group. Use it to keep one shared history, or create a new group with a different name.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setExistingGroupId(null)}>Create a new group</Button><Button onClick={finishWithExisting}>Use existing group</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

function NotificationList({
  notifications,
  conversations,
  people,
  currentUserId,
  onSelect,
}: {
  notifications: { id: string; conversation_id: string | null; message_id: string | null; created_at: string; read_at: string | null }[]
  conversations: { id: string; kind: string; name: string | null }[]
  people: TeamMember[]
  currentUserId: string
  onSelect: (conversationId: string, notificationId: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(true)
  if (notifications.length === 0) return null
  return (
    <section className="mx-3 mb-2 border-b pb-2" aria-label="Notifications">
      <button type="button" className="mb-1 flex w-full items-center gap-1.5 rounded px-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Bell className="size-3.5" /> Notifications
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
              <span className="min-w-0 flex-1 truncate">New message in {conversationTitle(conversation.kind, conversation.name, people, currentUserId)}</span>
              <time className="shrink-0 text-[10px] text-muted-foreground" dateTime={notification.created_at}>{formatNotificationTime(notification.created_at)}</time>
            </button>
          )
        })}
      </div>}
    </section>
  )
}

function AddGroupMemberDialog({ conversationId, members, people, onAdded }: { conversationId: string; members: { user_id: string }[]; people: TeamMember[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState('')
  const [history, setHistory] = useState<'all' | 'today' | 'after'>('after')
  const add = useMutation({
    mutationFn: () => addGroupMember(conversationId, userId, history),
    onSuccess: () => { onAdded(); setOpen(false); setUserId('') },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const candidates = people.filter((person) => !members.some((member) => member.user_id === person.user_id))
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="xs"><Users /> Add member</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a group member</DialogTitle><DialogDescription>Choose how much existing message history this person can see.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="group-member">Person</Label><select id="group-member" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Choose a person</option>{candidates.map((person) => <option key={person.user_id} value={person.user_id}>{person.profile?.display_name ?? 'Unnamed member'}</option>)}</select></div>
          <div className="space-y-2"><Label>History access</Label>{([['after', 'Only after adding'], ['today', 'From today'], ['all', 'From the beginning']] as const).map(([value, label]) => <label key={value} className="flex items-start gap-2 text-sm"><input type="radio" name="history-access" checked={history === value} onChange={() => setHistory(value)} /><span>{label}</span></label>)}</div>
        </div>
        <DialogFooter><Button onClick={() => add.mutate()} disabled={!userId || add.isPending}>{add.isPending && <LoaderCircle className="animate-spin" />}Add member</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConversationItem({ conversation, title, active, onClick }: { conversation: { id: string; kind: string; name: string | null }; title: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-w-44 items-center gap-2 rounded-md px-3 py-2 text-left text-sm lg:w-full ${active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}><span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-xs">{conversation.kind === 'channel' ? '#' : <MessageCircle className="size-3.5" />}</span><span className="truncate">{title}</span></button>
}

function conversationTitle(kind: string, name: string | null, people: { user_id: string; profile: { display_name: string | null } | null }[], currentUserId: string, participantIds: string[] = []) {
  if (kind === 'channel') return name ? `# ${name}` : '# channel'
  if (kind === 'group') return name ?? 'Group conversation'
  const otherId = participantIds.find((id) => id !== currentUserId)
  return people.find((person) => person.user_id === otherId)?.profile?.display_name ?? 'Direct message'
}

function authorName(authorId: string, people: TeamMember[]) {
  return people.find((person) => person.user_id === authorId)?.profile?.display_name ?? 'Unknown member'
}

function authorInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'U'
}

function formatNotificationTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function EmptyMessages() {
  return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground"><div><MessageCircle className="mx-auto mb-2 size-8" /><p>Select a conversation to start messaging.</p></div></div>
}