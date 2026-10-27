import { useSuspenseQueries } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/hooks'
import { useCollectionView } from '@/features/collections/hooks'
import { teamIssuesQuery, type TeamIssue } from '@/features/issues/api'
import { StarButton } from '@/features/issues/components/StarButton'
import { IssueList } from '@/features/issues/components/IssueList'
import { NestToggle } from '@/features/issues/components/NestToggle'
import { TeamIssueRow } from '@/features/issues/components/TeamIssueRow'
import { useUpdateTeamIssue } from '@/features/issues/hooks'
import { isClosed } from '@/features/issues/meta'
import { useNested } from '@/features/issues/useNested'
import { Segmented } from '@/features/issues/hub/components/Segmented'
import { teamPlansQuery } from '@/features/plans/api'
import { sortPlans } from '@/features/plans/meta'
import { useCurrentTeam } from '@/features/teams/hooks'

const ALL = 'all'
/** Filters as quiet text buttons, like the project toolbar's, not form fields. */
const QUIET_SELECT = 'h-7 w-auto gap-1 border-transparent bg-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground dark:bg-transparent dark:hover:bg-muted'
const SHOWS = [
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
] as const
type Show = (typeof SHOWS)[number]['id']

/**
 * Issues hub → My issues (the default tab): what's assigned to you in every project of the collection
 * view, open first. Your own work first (owner's choice): other people's issues are seen through a
 * plan, a sprint or a saved view. Filters (project, plan, open/done) live in the URL.
 */
export function HubMyIssuesPage() {
  const { user } = useAuth()
  const { team } = useCurrentTeam()
  const { inView } = useCollectionView()
  const [{ data: everything }, { data: plans }] = useSuspenseQueries({ queries: [teamIssuesQuery(team.id), teamPlansQuery(team.id)] })
  const [params, setParams] = useSearchParams()
  const [nested, setNested] = useNested()
  const update = useUpdateTeamIssue(team.id)

  const mine = everything.filter((i) => i.assignee_id === user.id && inView(i.workspace.id))
  const projects = [...new Map(everything.filter((i) => inView(i.workspace.id)).map((i) => [i.workspace.id, i.workspace])).values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  )
  const show = (SHOWS.find((s) => s.id === params.get('show'))?.id ?? 'open') as Show
  const project = params.get('project') ?? ALL
  const plan = params.get('plan') ?? ALL
  const issues = mine.filter(
    (i) =>
      (project === ALL || i.workspace.id === project) &&
      (plan === ALL || (plan === 'none' ? i.plan_id === null : i.plan_id === plan)) &&
      (show === 'all' || (show === 'done') === isClosed(i.status)),
  ) as TeamIssue[]

  const setParam = (key: string, value: string, fallback: string) =>
    setParams(
      (p) => {
        if (value === fallback) p.delete(key)
        else p.set(key, value)
        return p
      },
      { replace: true },
    )

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Which of my issues" options={SHOWS} value={show} onChange={(id) => setParam('show', id, 'open')} />
        {projects.length > 1 && (
          <Select value={project} onValueChange={(v) => v !== '' && setParam('project', v, ALL)}>
            <SelectTrigger size="sm" className={QUIET_SELECT} aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {plans.length > 0 && (
          <Select value={plan} onValueChange={(v) => v !== '' && setParam('plan', v, ALL)}>
            <SelectTrigger size="sm" className={QUIET_SELECT} aria-label="Plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All plans</SelectItem>
              <SelectItem value="none">No plan</SelectItem>
              {sortPlans(plans).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="flex-1" />
        <span className="font-mono text-xs text-muted-foreground" title="Shown / assigned to you">
          {issues.length} · {mine.length}
        </span>
        <StarButton target={{ kind: 'my_issues' }} label="My issues" />
        <NestToggle nested={nested} onChange={setNested} />
      </div>

      {issues.length === 0 ? (
        <div className="border-y py-12 text-center text-sm text-muted-foreground">
          {mine.length === 0
            ? 'Nothing is assigned to you yet. Pick an issue up from a plan, or ask your lead.'
            : show === 'open'
              ? 'All done. Nothing open is assigned to you.'
              : 'None of your issues match.'}
        </div>
      ) : (
        <IssueList
          issues={issues}
          nested={nested}
          row={(issue, subIssues, nest) => (
            <TeamIssueRow
              issue={issue}
              subIssues={subIssues}
              nest={nest}
              teamSlug={team.slug}
              userId={user.id}
              showProject={projects.length > 1}
              plans={plans}
              update={(issue, patch) => update.mutate({ issue, patch })}
            />
          )}
        />
      )}
    </>
  )
}
