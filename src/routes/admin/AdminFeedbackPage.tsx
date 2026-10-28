import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Check, CircleAlert, Lightbulb, MessageSquareText, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { adminFeedbackQuery, adminKeys, setFeedbackStatus, type AdminFeedback } from '@/features/admin/api'
import { errorMessage } from '@/lib/errors'
import { formatDate, timeSince } from '@/lib/format'
import { cn } from '@/lib/utils'

const KIND = {
  problem: { label: 'Problem', icon: CircleAlert, className: 'text-red-600 dark:text-red-400' },
  idea: { label: 'Idea', icon: Lightbulb, className: 'text-amber-600 dark:text-amber-400' },
  other: { label: 'Other', icon: MessageSquareText, className: 'text-muted-foreground' },
} as const

const FILTERS = [
  { id: 'new', label: 'New' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
] as const
type Filter = (typeof FILTERS)[number]['id']

/** /admin/feedback: what people sent with the app's Feedback button, newest first. Mark each done once handled. */
export function AdminFeedbackPage() {
  const feedback = useSuspenseQuery(adminFeedbackQuery()).data
  const [now] = useState(Date.now)
  const [filter, setFilter] = useState<Filter>('new')
  const queryClient = useQueryClient()
  const counts = { new: feedback.filter((f) => f.status === 'new').length, done: feedback.filter((f) => f.status === 'done').length, all: feedback.length }
  const shown = filter === 'all' ? feedback : feedback.filter((f) => f.status === filter)

  // Instant (the row moves to its list), rolled back with a toast if the database refuses.
  const mark = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'new' | 'done' }) => setFeedbackStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.feedback })
      const before = queryClient.getQueryData<AdminFeedback[]>(adminKeys.feedback)
      queryClient.setQueryData<AdminFeedback[]>(adminKeys.feedback, (rows) =>
        rows?.map((f) => (f.id === id ? { ...f, status, done_at: status === 'done' ? new Date().toISOString() : null } : f)),
      )
      return { before }
    },
    onError: (e, _vars, context) => {
      if (context?.before) queryClient.setQueryData(adminKeys.feedback, context.before)
      toast.error(errorMessage(e))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.feedback }),
  })

  return (
    <>
      <PageHeader
        title="Feedback"
        description={counts.new === 0 ? 'Nothing new. Everything people sent is below under Done.' : `${counts.new} new ${counts.new === 1 ? 'message' : 'messages'} from people using DevDock.`}
      />
      <div role="tablist" aria-label="Show" className="mb-4 flex gap-1 border-b">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'border-b-2 px-2.5 py-2 text-sm transition-colors',
              filter === f.id ? 'border-brand font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label} <span className="font-mono text-xs tabular-nums text-muted-foreground">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {feedback.length === 0 ? 'No feedback yet. It appears here when someone uses the Feedback button in the app’s header.' : filter === 'new' ? 'All caught up.' : 'Nothing here.'}
        </p>
      ) : (
        <ul className="divide-y">
          {shown.map((f) => {
            const kind = KIND[f.kind] ?? KIND.other
            const Icon = kind.icon
            return (
              <li key={f.id} data-admin-feedback={f.id} data-status={f.status} className="flex gap-3 py-4">
                <Icon className={cn('mt-0.5 size-4 shrink-0', kind.className)} aria-label={kind.label} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{f.sender_name ?? f.sender_email ?? 'Deleted account'}</span>
                    {f.sender_email && f.sender_name && <span className="text-xs text-muted-foreground">{f.sender_email}</span>}
                    {f.team_name && <span className="text-xs text-muted-foreground">· {f.team_name}</span>}
                    <span className="text-xs text-muted-foreground" title={formatDate(f.created_at)}>
                      · {timeSince(f.created_at, now)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm break-words whitespace-pre-wrap">{f.message}</p>
                  <p className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground">
                    <span>{kind.label}</span>
                    {f.page && <span className="max-w-full truncate">{f.page}</span>}
                    {f.context.screen && <span>{f.context.screen}</span>}
                    {f.context.theme && <span>{f.context.theme}</span>}
                    {f.context.browser && (
                      <span className="max-w-full truncate" title={f.context.browser}>
                        {f.context.browser}
                      </span>
                    )}
                  </p>
                </div>
                <div className="shrink-0">
                  {f.status === 'new' ? (
                    <Button variant="outline" size="sm" onClick={() => mark.mutate({ id: f.id, status: 'done' })}>
                      <Check />
                      Done
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => mark.mutate({ id: f.id, status: 'new' })}>
                      <RotateCcw />
                      Mark new
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
