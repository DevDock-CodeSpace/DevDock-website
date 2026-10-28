import { useIsFetching, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Circle, ExternalLink, FileText, Info, LoaderCircle, RefreshCw, Send, Target } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { markNinetyPageLeft, ninetyOverviewQuery, ninetyKeys, readBefore, sendNinetyWaiting, type NinetyOverview, type NinetySource } from '@/features/ninety/api'
import { errorMessage } from '@/lib/errors'
import { useFeature } from '@/features/flags/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { formatShortDate, timeSince } from '@/lib/format'
import { cn } from '@/lib/utils'

type Connected = Extract<NinetyOverview, { connected: true }>

const TABS = [
  { id: 'todos', label: 'To-Dos' },
  { id: 'rocks', label: 'Rocks' },
  // Ninety calls them Issues; in DevDock that word means DevDock issues, so the tab says IDS (owner, 2026-10-28).
  { id: 'issues', label: 'IDS' },
  { id: 'headlines', label: 'Headlines' },
  { id: 'scorecard', label: 'Scorecard' },
] as const
type Tab = (typeof TABS)[number]['id']
/** Navigation state of a tab switch, so it isn't taken for arriving at the page again. */
const TAB_SWITCH = { eosTab: true }

const ROCK_STATUS: Record<string, { label: string; className: string }> = {
  ON_TRACK: { label: 'On track', className: 'text-emerald-600 dark:text-emerald-400' },
  OFF_TRACK: { label: 'Off track', className: 'text-red-600 dark:text-red-400' },
  DONE: { label: 'Done', className: 'text-muted-foreground' },
  CANCELED: { label: 'Canceled', className: 'text-muted-foreground line-through' },
  DRAFT: { label: 'Draft', className: 'text-muted-foreground' },
}

/**
 * Group → Ninety (behind the ninety_sync flag): what is in Ninety right now for the teams this group
 * sends to, read live, each item marked with the DevDock issue or plan it came from. How people (and
 * we) check the sync did what it should. Items from issues the reader can't open are left out.
 */
export function NinetyPage() {
  const { team } = useCurrentTeam()
  // Without the flag this page doesn't exist (route-error shaped, so the usual inline 404 shows).
  if (!useFeature('ninety_sync')) throw { status: 404, statusText: 'Not Found', internal: false, data: 'Page not found.' }
  const overview = useSuspenseQuery(ninetyOverviewQuery(team.id)).data
  useReadOnArrival(team.id)

  if (!overview.connected) {
    return (
      <>
        <PageHeader title="EOS" description="Your EOS work in Ninety, kept up to date from DevDock." />
        <div className="py-16 text-center">
          <Target className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Ninety isn’t connected yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A group owner or admin connects it in{' '}
            <Link to={`/t/${team.slug}/settings`} className="text-foreground underline-offset-4 hover:underline">
              Group settings → EOS
            </Link>
            .
          </p>
        </div>
      </>
    )
  }
  return <Connected overview={overview} />
}

/**
 * Arriving reads Ninety again unless the copy was requested after the page was last left (see
 * ninetyOverviewQuery). Leaving and clicking back before the other page has opened keeps this page mounted,
 * so that counts as arriving too; the tab buttons mark their own navigations (TAB_SWITCH), which don't.
 * Called next to the page's useSuspenseQuery: its observer must be subscribed, or refetchQueries skips it.
 */
function useReadOnArrival(teamId: string) {
  const queryClient = useQueryClient()
  const location = useLocation()
  const arrivedAt = useRef(location.key)
  const tabSwitch = (location.state as { eosTab?: boolean } | null)?.eosTab === true
  useEffect(() => {
    const queryKey = ninetyKeys.overview(teamId)
    const again = location.key !== arrivedAt.current
    arrivedAt.current = location.key
    const requestedAt = queryClient.getQueryData<{ requestedAt: number }>(queryKey)?.requestedAt
    if (again ? !tabSwitch : readBefore(teamId, requestedAt)) void queryClient.refetchQueries({ queryKey })
  }, [location.key, tabSwitch, queryClient, teamId])
  useEffect(
    () => () => {
      // Recorded a moment later: StrictMode's instant unmount and remount in development isn't leaving.
      const at = Date.now()
      setTimeout(() => markNinetyPageLeft(teamId, at), 0)
    },
    [teamId],
  )
}

function Connected({ overview }: { overview: Connected }) {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'todos') as Tab
  const [now] = useState(Date.now)
  // Refresh asks Ninety again; the page stays on screen meanwhile.
  const refreshing = useIsFetching({ queryKey: ninetyKeys.overview(team.id) }) > 0
  const refresh = () => queryClient.refetchQueries({ queryKey: ninetyKeys.overview(team.id) })
  // DevDock sends twice a day (00:00 and 12:00 UTC); Sync now sends what's waiting at once, for anyone.
  const send = useMutation({
    // The count shown when clicked: a waiting change can turn out to need nothing in Ninety.
    mutationFn: () => sendNinetyWaiting(team.id).then((r) => ({ ...r, waited: overview.waiting })),
    onSuccess: (r) => {
      if (r.stopped) toast.error('Ninety stopped part-way. A group admin can see why in Group settings → EOS.')
      else if (r.failed) toast.error(`${r.sent} sent, ${r.failed} couldn’t be sent. They’ll be tried again.`)
      else if (r.sent) toast.success(`Sent ${r.sent} ${r.sent === 1 ? 'change' : 'changes'} to Ninety`)
      else if (r.waited) toast.success(`Checked ${r.waited} ${r.waited === 1 ? 'change' : 'changes'}: Ninety already matches DevDock`)
      else toast.success('Ninety is already up to date')
      return queryClient.invalidateQueries({ queryKey: ninetyKeys.all(team.id) })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const multi = overview.teams.length > 1
  const teamName = (id: string) => overview.teams.find((t) => t.id === id)?.name ?? ''

  const counts: Record<Tab, number> = {
    todos: overview.todos.filter((t) => !t.completed).length,
    rocks: overview.rocks.length,
    issues: overview.issues.filter((i) => !i.completed).length,
    headlines: overview.headlines.length,
    scorecard: overview.scorecards.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.kpis.length, 0), 0),
  }

  return (
    <>
      <PageHeader
        title="EOS"
        description={`What’s in Ninety now for ${overview.teams.map((t) => t.name).join(', ') || 'no team yet'} · read ${timeSince(overview.fetchedAt, now)}`}
      >
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing || send.isPending}>
          {refreshing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
        {/* Never disabled by the count: it can be a moment old. With nothing waiting it costs no Ninety call. */}
        <Button size="sm" onClick={() => send.mutate()} disabled={send.isPending}>
          {send.isPending ? <LoaderCircle className="animate-spin" /> : <Send />}
          Sync now
        </Button>
      </PageHeader>

      <p className="-mt-3 mb-5 text-sm text-muted-foreground" data-ninety-waiting={overview.waiting}>
        {overview.waiting === 0
          ? 'Ninety has every change from DevDock.'
          : `${overview.waiting} ${overview.waiting === 1 ? 'change is' : 'changes are'} waiting. DevDock sends them at 00:00 and 12:00 UTC, or now with Sync now.`}
      </p>

      {overview.teams.length === 0 && (
        <p className="mb-6 text-sm text-muted-foreground">No project is sent to Ninety yet. A group owner or admin links one in Group settings → EOS.</p>
      )}
      {overview.failed.length > 0 && (
        <div role="alert" className="mb-4 flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>Ninety didn’t answer for {overview.failed.join(', ')}. The rest is current; try Refresh.</span>
        </div>
      )}

      {/* The divider is on the wrapper: tabs hanging over it (-mb-px) made the scrolling bar overflow downwards too,
          and some systems then showed a vertical scrollbar. The bar scrolls sideways only, on narrow phones. */}
      <div className="mb-4 border-b">
      <nav aria-label="EOS" className="flex gap-1 overflow-x-auto overflow-y-hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setParams(t.id === 'todos' ? {} : { tab: t.id }, { replace: true, state: TAB_SWITCH })}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn(
              'shrink-0 border-b-2 px-2.5 py-2 text-sm transition-colors',
              tab === t.id ? 'border-brand font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label} <span className="ml-1 font-mono text-xs text-muted-foreground tabular-nums">{counts[t.id]}</span>
          </button>
        ))}
        <HowItWorks tab={tab} overview={overview} />
      </nav>
      </div>

      <div data-ninety-tab={tab}>
        {tab === 'todos' && <TodoList overview={overview} team={multi ? teamName : null} />}
        {tab === 'rocks' && <RockList overview={overview} team={multi ? teamName : null} />}
        {tab === 'issues' && <IssueList overview={overview} team={multi ? teamName : null} />}
        {tab === 'headlines' && <HeadlineList overview={overview} team={multi ? teamName : null} />}
        {tab === 'scorecard' && <Scorecards overview={overview} team={teamName} />}
      </div>
    </>
  )
}

type ListProps = { overview: Connected; team: ((id: string) => string) | null }
const hint = (tab: Tab, overview: Connected) => <HowText tab={tab} overview={overview} />

function TodoList({ overview, team }: ListProps) {
  const open = overview.todos.filter((t) => !t.completed)
  const done = overview.todos.filter((t) => t.completed)
  if (overview.todos.length === 0) return <Empty title="No To-Dos in Ninety yet">{hint('todos', overview)}</Empty>
  return (
    <>
      <Rows>
        {open.map((t) => (
          <Row key={t.id} done={false} title={t.title} source={t.source} meta={[t.owner, t.dueDate && `Due ${formatShortDate(t.dueDate.slice(0, 10))}`, team?.(t.teamId)]} />
        ))}
      </Rows>
      {done.length > 0 && (
        <>
          <h2 className="mt-6 mb-1 text-xs font-medium text-muted-foreground">Recently completed</h2>
          <Rows>
            {done.map((t) => (
              <Row key={t.id} done title={t.title} source={t.source} meta={[t.owner, team?.(t.teamId)]} />
            ))}
          </Rows>
        </>
      )}
    </>
  )
}

function RockList({ overview, team }: ListProps) {
  if (overview.rocks.length === 0) return <Empty title="No Rocks in Ninety yet">{hint('rocks', overview)}</Empty>
  return (
    <Rows>
      {overview.rocks.map((r) => {
        const status = ROCK_STATUS[r.status] ?? { label: r.status, className: 'text-muted-foreground' }
        return (
          <li key={r.id} data-ninety-rock={r.id} className="py-2.5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Target className="size-4 shrink-0 text-muted-foreground" />
                <span className={cn('truncate text-sm font-medium', r.completed && 'text-muted-foreground')}>{r.title}</span>
              </span>
              <span className={cn('shrink-0 text-xs font-medium', status.className)}>{status.label}</span>
              <Meta items={[r.owner, r.quarter, r.dueDate && `Due ${formatShortDate(r.dueDate.slice(0, 10))}`, team?.(r.teamId)]} />
              <SourceChip source={r.source} />
            </div>
            {r.milestones.length > 0 && (
              <ul className="mt-1.5 ml-6 space-y-1 border-l pl-3">
                {r.milestones.map((m) => (
                  <li key={m.id} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:gap-3">
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {m.done ? <CircleCheck className="size-3.5 shrink-0 text-muted-foreground" /> : <Circle className="size-3.5 shrink-0 text-muted-foreground" />}
                      <span className={cn('truncate', m.done && 'text-muted-foreground line-through')}>{m.title}</span>
                    </span>
                    <Meta items={[m.owner, m.dueDate && formatShortDate(m.dueDate.slice(0, 10))]} />
                    {/* Ninety can't delete a Milestone: one DevDock retired is marked "(removed)" and has no link any more. */}
                    {!m.source && m.title.endsWith('(removed)') ? (
                      <span className="ml-6 shrink-0 text-xs text-muted-foreground sm:ml-0 sm:w-36 sm:text-right">Removed from plan</span>
                    ) : (
                      <SourceChip source={m.source} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </Rows>
  )
}

function IssueList({ overview, team }: ListProps) {
  if (overview.issues.length === 0) return <Empty title="Nothing on the IDS list yet">{hint('issues', overview)}</Empty>
  return (
    <Rows>
      {overview.issues.map((i) => (
        <Row
          key={i.id}
          done={i.completed}
          title={i.title}
          source={i.source}
          meta={[i.owner, i.term === 'LONG_TERM' ? 'Long term' : 'Short term', i.completed ? 'Solved' : null, team?.(i.teamId)]}
        />
      ))}
    </Rows>
  )
}

function HeadlineList({ overview, team }: ListProps) {
  if (overview.headlines.length === 0) return <Empty title="No Headlines in Ninety yet">{hint('headlines', overview)}</Empty>
  return (
    <Rows>
      {overview.headlines.map((h) => (
        <Row key={h.id} done={false} icon={<FileText className="size-4 shrink-0 text-muted-foreground" />} title={h.title} source={h.source} meta={[h.owner, h.createdAt && formatShortDate(h.createdAt.slice(0, 10)), team?.(h.teamId)]} />
      ))}
    </Rows>
  )
}

function Scorecards({ overview, team }: { overview: Connected; team: (id: string) => string }) {
  const any = overview.scorecards.some((s) => s.groups.some((g) => g.kpis.length > 0))
  if (!any) return <Empty title="No measurables on the Scorecard yet">{hint('scorecard', overview)}</Empty>
  return (
    <div className="space-y-8">
      {overview.scorecards.map((s) =>
        s.groups
          .filter((g) => g.kpis.length > 0)
          .map((g) => (
            <section key={`${s.teamId}-${g.name}`}>
              <h2 className="mb-2 text-sm font-semibold">
                {g.name} <span className="font-normal text-muted-foreground">· {team(s.teamId)}</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-4 font-medium">Measurable</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Goal</th>
                      {s.periods.map((p) => (
                        <th key={p.start} scope="col" className="py-2 pr-4 text-right font-medium whitespace-nowrap">
                          {p.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {g.kpis.map((k) => (
                      <tr key={k.title}>
                        <td className="py-2 pr-4">{k.title}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{k.goal ?? '—'}</td>
                        {k.scores.map((v, i) => (
                          <td key={s.periods[i]?.start ?? i} className="py-2 pr-4 text-right font-mono tabular-nums">
                            {v ?? <span className="text-muted-foreground">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )),
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------ how things get here

const NINETY_APP = 'https://app.ninety.io'

/** What puts things on a tab's list, in a few plain words. Shown in the "How it works" popover and in empty states. */
function HowText({ tab, overview }: { tab: Tab; overview: Connected }) {
  const { team } = useCurrentTeam()
  const settings = (
    <Link to={`/t/${team.slug}/settings`} className="text-foreground underline-offset-4 hover:underline">
      Group settings → EOS
    </Link>
  )
  const openNinety = (
    <a href={NINETY_APP} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline">
      Open Ninety <ExternalLink className="size-3" />
    </a>
  )
  const strong = (text: string) => <strong className="font-medium text-foreground">{text}</strong>
  const from = overview.projects.map((p) => `${p.name} → ${p.team}`).join(', ')

  if (tab === 'todos') {
    if (!from) return <p>No project is sending its issues yet. A group owner or admin can choose one in {settings}.</p>
    return (
      <>
        <p>Issues show up here when they are:</p>
        <ul className="ml-4 list-disc">
          <li>{strong('in the current sprint')}</li>
          <li>{strong('assigned to someone')}</li>
        </ul>
        <p>Close the issue and its To-Do is checked off.</p>
        <p className="text-xs">Sent from: {from}</p>
      </>
    )
  }
  if (tab === 'rocks') {
    if (!overview.rocksTeam) return <p>Plans aren’t being sent. A group owner or admin can turn this on in {settings}.</p>
    return (
      <>
        <p>
          Plans show up here as Rocks. {strong('Give a plan a target date')} to send it. Issues in the plan with a due date appear under it.
        </p>
        <p className="text-xs">Sent to: {overview.rocksTeam}</p>
      </>
    )
  }
  if (tab === 'issues') {
    return (
      <p>
        Add the {strong('IDS')} label to an issue to put it here. Remove the label or close the issue when it’s solved.
      </p>
    )
  }
  return (
    <p>
      {tab === 'headlines' ? 'Add headlines in Ninety.' : 'Add measurables and their numbers in Ninety.'} They show up here. {openNinety}
    </p>
  )
}

/** A quiet "How it works" at the end of the tab bar; the explanation opens on demand. */
function HowItWorks({ tab, overview }: { tab: Tab; overview: Connected }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="ml-auto flex shrink-0 items-center gap-1 px-2 py-2 text-xs text-muted-foreground hover:text-foreground" data-ninety-how>
          <Info className="size-3.5" />
          How it works
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-sm leading-relaxed text-muted-foreground" data-ninety-help={tab}>
        <div className="space-y-1.5">
          <HowText tab={tab} overview={overview} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ------------------------------------------------------------------------------------------------ pieces

function Rows({ children }: { children: ReactNode }) {
  return <ul className="divide-y">{children}</ul>
}

function Row({ title, done, source, meta, icon }: { title: string; done: boolean; source: NinetySource | null; meta: (string | null | undefined | false)[]; icon?: ReactNode }) {
  return (
    <li className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3" data-ninety-row>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {icon ?? (done ? <CircleCheck className="size-4 shrink-0 text-muted-foreground" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />)}
        <span className={cn('truncate text-sm', done && 'text-muted-foreground line-through')}>{title}</span>
      </span>
      <Meta items={meta} />
      <SourceChip source={source} />
    </li>
  )
}

function Meta({ items }: { items: (string | null | undefined | false)[] }) {
  const shown = items.filter((i): i is string => typeof i === 'string' && i.length > 0)
  if (shown.length === 0) return null
  return <span className="shrink-0 pl-6 text-xs text-muted-foreground sm:pl-0">{shown.join(' · ')}</span>
}

/** Where it came from in DevDock (opens it), or that it was made in Ninety. */
function SourceChip({ source }: { source: NinetySource | null }) {
  if (!source) return <span className="ml-6 shrink-0 text-xs text-muted-foreground sm:ml-0 sm:w-36 sm:text-right">In Ninety only</span>
  return (
    <span className="ml-6 shrink-0 sm:ml-0 sm:w-36 sm:text-right">
      <Link to={source.path} className="inline-flex max-w-full items-center rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent" title={source.kind === 'plan' ? `Plan: ${source.label}` : source.label}>
        <span className="truncate">{source.kind === 'plan' ? `Plan · ${source.label}` : source.label}</span>
      </Link>
    </span>
  )
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg py-10 text-center" data-ninety-empty>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1 space-y-1.5 text-sm leading-relaxed text-muted-foreground [&_ul]:inline-block [&_ul]:text-left">{children}</div>
    </div>
  )
}
