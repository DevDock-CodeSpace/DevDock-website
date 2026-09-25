import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuePath, issuesPath } from '@/features/teams/nav'
import { errorMessage } from '@/lib/errors'
import { deleteIssue, issueKeys, workspaceIssuesQuery, type IssueDetail } from '../api'
import { useIssueContext, useUpdateIssue } from '../hooks'
import { issueIdentifier } from '../meta'
import { IssueComments } from './IssueComments'
import { IssueDescription } from './IssueDescription'
import { IssueProperties } from './IssueProperties'
import { SubIssues } from './SubIssues'

/**
 * The issue page (lazy-loaded with the description editor), laid out like
 * Linear's: title, description, sub-issues and comments; properties on the right.
 */
export default function IssueView({ issue }: { issue: IssueDetail }) {
  const { team } = useCurrentTeam()
  const { workspace, canManage } = useIssueContext()
  const issues = useSuspenseQuery(workspaceIssuesQuery(workspace.id)).data
  const update = useUpdateIssue()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const parent = issues.find((i) => i.id === issue.parent_id)
  const id = issueIdentifier(workspace.issue_key, issue.number)

  // ------------------------------------------------------------ title
  const [title, setTitle] = useState(issue.title)
  const titleField = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = titleField.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])
  const commitTitle = () => {
    const next = title.trim()
    if (!next) setTitle(issue.title)
    else if (next !== issue.title) update.mutate({ issue, patch: { title: next } })
  }

  // ------------------------------------------------------------ delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = async () => {
    setDeleting(true)
    try {
      await deleteIssue(issue.id)
      toast.success(`${id} was deleted`)
      // Leave the page before dropping its data (see useExitTeam for why).
      await navigate(issuesPath(team.slug, workspace.id), { replace: true })
      queryClient.removeQueries({ queryKey: issueKeys.detail(workspace.id, issue.number) })
      await queryClient.invalidateQueries({ queryKey: issueKeys.all })
    } catch (error) {
      toast.error(errorMessage(error))
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <div className="min-w-0 flex-1 lg:max-w-[760px]">
        <div className="mb-6 flex items-center justify-between gap-3">
          <nav aria-label="Issue" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Link to={issuesPath(team.slug, workspace.id)} className="inline-flex shrink-0 items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Issues
            </Link>
            {parent && (
              <>
                <ChevronRight className="size-3 shrink-0" />
                <Link
                  to={issuePath(team.slug, workspace.id, parent.number)}
                  className="min-w-0 truncate hover:text-foreground"
                  title={parent.title}
                >
                  <span className="font-mono">{issueIdentifier(workspace.issue_key, parent.number)}</span> {parent.title}
                </Link>
              </>
            )}
            <ChevronRight className="size-3 shrink-0" />
            <span className="shrink-0 font-mono text-foreground">{id}</span>
          </nav>
          {canManage && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete issue"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
            </Button>
          )}
        </div>

        <textarea
          ref={titleField}
          value={title}
          rows={1}
          maxLength={300}
          aria-label="Title"
          placeholder="Issue title"
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
            if (e.key === 'Escape') {
              setTitle(issue.title)
              e.currentTarget.blur()
            }
          }}
          className="mb-3 block w-full resize-none overflow-hidden bg-transparent text-2xl leading-tight font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
        />

        <IssueDescription issue={issue} />

        <div className="mt-10 space-y-10 border-t pt-6">
          <SubIssues issue={issue} />
          <IssueComments issue={issue} />
        </div>
      </div>

      <div className="shrink-0 border-t pt-6 lg:w-64 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
        <IssueProperties issue={issue} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${id}?`}
        description="This can’t be undone. Its comments are deleted too; its sub-issues are kept and become top-level issues."
        confirmLabel="Delete issue"
        pending={deleting}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
