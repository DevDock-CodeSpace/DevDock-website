import { useQuery } from '@tanstack/react-query'
import { Goal, IterationCw, Layers, Plus, Settings, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { NameDialog } from '@/components/NameDialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/features/auth/hooks'
import { useCollectionView } from '@/features/collections/hooks'
import { teamIssuesQuery } from '@/features/issues/api'
import { ProjectChooser } from '@/features/issues/hub/components/ProjectChooser'
import { useHubProjects } from '@/features/issues/hub/hooks'
import { isClosed } from '@/features/issues/meta'
import { teamPlansQuery } from '@/features/plans/api'
import { useCreatePlan } from '@/features/plans/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { hasTeamIssues, hubPlansPath, hubSettingsPath, hubSprintsPath, hubViewsPath, issuesPath, planPath, teamIssuesPath } from '@/features/teams/nav'
import { cn } from '@/lib/utils'

/**
 * Sidebar → Issues: the Issues hub (docs/ISSUES_HUB_PLAN.md). Everything about issues starts here:
 * My issues (the default: your own work first), Plans, Sprints and Views, with underlined tabs like a
 * project's. One main action per tab (New plan on Plans, New issue elsewhere) and ⚙ Issue settings
 * (import) for leads and admins. A plan's own page has its own header, so the hub's steps aside there.
 * Each tab is its own lazy route; issuesHubLoader starts the group's issues, plans and people.
 */
export function IssuesHubLayout() {
  const { user } = useAuth()
  const { team } = useCurrentTeam()
  const { collection, workspaces, inView } = useCollectionView()
  const projects = useHubProjects()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const createPlan = useCreatePlan(team.id)
  const [planDialog, setPlanDialog] = useState(false)
  // Counts for the tabs, from what the loader already fetched (no request of their own).
  const issues = useQuery(teamIssuesQuery(team.id)).data
  const plans = useQuery(teamPlansQuery(team.id)).data
  const where = collection ? collection.name : team.name

  if (!hasTeamIssues(collection?.type ?? team.type, workspaces)) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Issues show here once {where} has a project.</p>
  }
  if (matchPath('/t/:teamSlug/issues/plans/:planId', pathname)) return <Outlet />

  const mine = issues?.filter((i) => i.assignee_id === user.id && !isClosed(i.status) && inView(i.workspace.id)).length
  const tabs = [
    { to: teamIssuesPath(team.slug), label: 'My issues', icon: UserCheck, count: mine, end: true },
    { to: hubPlansPath(team.slug), label: 'Plans', icon: Goal, count: plans?.length, end: false },
    { to: hubSprintsPath(team.slug), label: 'Sprints', icon: IterationCw, count: undefined, end: false },
    { to: hubViewsPath(team.slug), label: 'Views', icon: Layers, count: undefined, end: false },
  ]
  const managed = projects.filter((p) => p.canManage)
  const onPlans = pathname.startsWith(hubPlansPath(team.slug))

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
          <p className="text-sm text-muted-foreground">Your work, the plans and the sprints in {where}.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Importing and who imported names are: every few months, so tucked away (owner's choice). */}
          {managed.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild size="icon-sm" variant="ghost" aria-label="Issue settings" className="text-muted-foreground">
                  <Link to={hubSettingsPath(team.slug)}>
                    <Settings />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Issue settings: import, people from imports</TooltipContent>
            </Tooltip>
          )}
          {/* One main action per tab (owner's choice): New plan on Plans, New issue everywhere else. */}
          {onPlans ? (
            <Button size="sm" onClick={() => setPlanDialog(true)}>
              <Plus /> New plan
            </Button>
          ) : (
            <ProjectChooser projects={projects} label="New issue in…" variant="default" to={(id) => `${issuesPath(team.slug, id)}?new=1`}>
              <Plus /> New issue
            </ProjectChooser>
          )}
        </div>
      </header>

      {/* The same tabs as a project's (WorkspaceLayout): underlined, small icons. */}
      <nav aria-label="Issues hub" className="-mx-4 mt-5 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none] md:mx-0 [&::-webkit-scrollbar]:hidden">
        <ul className="flex gap-1 px-4 md:px-0">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-1.5 px-2.5 py-2.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                    isActive && 'font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand',
                  )
                }
              >
                <tab.icon className="size-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && <span className="font-mono text-[11px] font-normal text-muted-foreground">{tab.count}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="pt-5">
        <Outlet />
      </div>

      {onPlans && (
        <NameDialog
          open={planDialog}
          onOpenChange={setPlanDialog}
          title="New plan"
          description="A goal for the group, like “Custom auth roles”. It gets a folder in Files with a Brief and a Whiteboard; put issues from any project in it and follow its progress."
          submitLabel="Create plan"
          placeholder="Plan name"
          onSubmit={async (name) => {
            const planId = await createPlan.mutateAsync(name)
            void navigate(planPath(team.slug, planId))
          }}
        />
      )}
    </>
  )
}
