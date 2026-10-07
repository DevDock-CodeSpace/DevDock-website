import { Building2, Lock } from 'lucide-react'
import { PersonAvatar } from '@/components/PersonRow'
import type { Issue } from '../api'
import { cycleTotals, share } from '../cycleStats'
import { useIssueContext } from '../hooks'
import type { IssueView } from '../viewsApi'
import { BreakdownPanel } from './BreakdownPanel'

/** The details panel of the issues list: what is being shown (a saved view's visibility and owner) and how it splits. */
export function ViewInsights({ title, view, issues }: { title: string; view: IssueView | null; issues: Issue[] }) {
  const { members, workspace, userId } = useIssueContext()
  const owner = view ? members.find((m) => m.user_id === view.owner_id) : undefined
  const totals = cycleTotals(issues)
  return (
    <div className="space-y-5">
      <div>
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {issues.length} {issues.length === 1 ? 'issue' : 'issues'} · {share(totals.completed, totals.scope)}% done
        </p>
      </div>
      {view && (
        <dl className="space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Visibility</dt>
            <dd className="flex items-center gap-1.5">
              {view.shared ? <Building2 className="size-4 text-muted-foreground" /> : <Lock className="size-4 text-muted-foreground" />}
              {view.shared ? workspace.title : 'Only you'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="flex items-center gap-1.5">
              <PersonAvatar profile={owner?.profile ?? null} className="size-5" fallbackClassName="text-[9px]" />
              {view.owner_id === userId ? 'You' : (owner?.profile?.display_name ?? 'Former member')}
            </dd>
          </div>
        </dl>
      )}
      <BreakdownPanel issues={issues} />
    </div>
  )
}
