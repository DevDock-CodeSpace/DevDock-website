import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { LoaderCircle, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { errorMessage } from '@/lib/errors'
import { timeAgo } from '@/lib/format'
import {
  addComment,
  commentsQuery,
  deleteComment,
  issueKeys,
  updateComment,
  type IssueComment,
  type IssueDetail,
} from '../api'
import { useIssueContext } from '../hooks'

/** Comment thread + composer. Authors edit their own comments; authors and managers delete. */
export function IssueComments({ issue }: { issue: IssueDetail }) {
  const { canManage, userId } = useIssueContext()
  const comments = useSuspenseQuery(commentsQuery(issue.id)).data
  const queryClient = useQueryClient()
  const [now] = useState(Date.now)
  const [draft, setDraft] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: issueKeys.comments(issue.id) })

  const post = useMutation({
    mutationFn: () => addComment(issue.id, issue.workspace_id, draft),
    onSuccess: async () => {
      setDraft('')
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const submit = () => {
    if (draft.trim() && !post.isPending) post.mutate()
  }

  return (
    <section aria-label="Comments">
      <h2 className="mb-3 text-sm font-semibold">
        Comments {comments.length > 0 && <span className="font-mono text-xs font-normal text-muted-foreground">{comments.length}</span>}
      </h2>
      {comments.length > 0 && (
        <ul className="mb-4 space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              now={now}
              canEdit={comment.author_id === userId}
              canDelete={comment.author_id === userId || canManage}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
      <div className="rounded-lg border focus-within:ring-2 focus-within:ring-brand/40">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
          rows={3}
          maxLength={10000}
          placeholder="Leave a comment…"
          aria-label="Leave a comment"
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-end gap-2 px-2 pb-2">
          <span className="font-mono text-[10px] text-muted-foreground">⌘↵</span>
          <Button size="sm" variant="secondary" disabled={!draft.trim() || post.isPending} onClick={submit}>
            {post.isPending && <LoaderCircle className="animate-spin" />}
            Comment
          </Button>
        </div>
      </div>
    </section>
  )
}

function CommentItem({
  comment,
  now,
  canEdit,
  canDelete,
  onChanged,
}: {
  comment: IssueComment
  now: number
  canEdit: boolean
  canDelete: boolean
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const save = useMutation({
    mutationFn: () => updateComment(comment.id, draft),
    onSuccess: async () => {
      setEditing(false)
      await onChanged()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: () => deleteComment(comment.id),
    onSuccess: onChanged,
    onError: (error) => toast.error(errorMessage(error)),
  })
  const edited = comment.updated_at !== comment.created_at

  return (
    <li className="flex gap-3">
      <PersonAvatar profile={comment.author} className="mt-0.5 size-6" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{comment.author?.display_name ?? 'Former member'}</span>
          <span className="text-muted-foreground">
            {timeAgo(comment.created_at, now)}
            {edited && ' · edited'}
          </span>
          {(canEdit || canDelete) && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" className="ml-auto text-muted-foreground" aria-label="Comment actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>}
                {canDelete && (
                  <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate()}>
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {editing ? (
          <div className="mt-1 space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draft.trim()) save.mutate()
                if (e.key === 'Escape') {
                  setDraft(comment.body)
                  setEditing(false)
                }
              }}
              rows={3}
              aria-label="Edit comment"
              className="block w-full resize-none rounded-md border bg-transparent px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(comment.body)
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={!draft.trim() || save.isPending} onClick={() => save.mutate()}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm whitespace-pre-wrap break-words">{comment.body}</p>
        )}
      </div>
    </li>
  )
}
