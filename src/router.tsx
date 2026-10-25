import { createBrowserRouter, Outlet, redirect } from 'react-router'
import { AuthLoading } from '@/features/auth/components/AuthLoading'
import { InactivityGuard } from '@/features/auth/components/InactivityGuard'
import { authCallbackLoader, loginLoader } from '@/features/auth/loaders'
import { watchAuthIdentity } from '@/features/auth/session'
import { diagramLoader } from '@/features/diagrams/loaders'
import { docLoader, filesLoader, filesShouldRevalidate } from '@/features/docs/loaders'
import { cycleLoader, issueLoader, issuesLoader } from '@/features/issues/loaders'
import { lessonLoader } from '@/features/learning/loaders'
import { liveSessionLoader } from '@/features/live/loaders'
import { githubCallbackLoader } from '@/features/repos/loaders'
import { appIndexLoader, onboardingLoader, teamLoader, workspaceLoader } from '@/features/teams/loaders'
import { AppLayout } from '@/layouts/AppLayout'
import { APP_ROUTE_ID, appLoader } from '@/layouts/app-loader'
import { queryClient } from '@/lib/query-client'
import { DiagramPage } from '@/routes/DiagramPage'
import { DocPage } from '@/routes/DocPage'
import { GitHubCallbackPage } from '@/routes/GitHubCallbackPage'
import { MessagesPage } from '@/routes/team/MessagesPage'
import { FULL_BLEED } from '@/layouts/full-bleed'
import { NotFoundPage, RouteErrorPage } from '@/routes/NotFoundPage'
import { OnboardingPage } from '@/routes/OnboardingPage'
import { PrivacyPage } from '@/routes/PrivacyPage'
import { TeamIssuesPage } from '@/routes/team/TeamIssuesPage'
import { TeamLivePage } from '@/routes/team/TeamLivePage'
import { TeamMembersPage } from '@/routes/team/TeamMembersPage'
import { TeamSettingsPage } from '@/routes/team/TeamSettingsPage'
import { TeamWorkspacesPage } from '@/routes/team/TeamWorkspacesPage'
import { WorkspaceGitHubPage } from '@/routes/workspace/WorkspaceGitHubPage'
import { IssueCyclePage } from '@/routes/workspace/IssueCyclePage'
import { IssueCyclesPage } from '@/routes/workspace/IssueCyclesPage'
import { IssuePage } from '@/routes/workspace/IssuePage'
import { LearningProgressPage } from '@/routes/workspace/LearningProgressPage'
import { LessonPage } from '@/routes/workspace/LessonPage'
import { WorkspaceLearningPage } from '@/routes/workspace/WorkspaceLearningPage'
import { WorkspaceLivePage } from '@/routes/workspace/WorkspaceLivePage'
import { WorkspaceIssuesPage } from '@/routes/workspace/WorkspaceIssuesPage'
import { WorkspaceLayout } from '@/routes/workspace/WorkspaceLayout'
import { WorkspaceMembersPage } from '@/routes/workspace/WorkspaceMembersPage'
import { WorkspaceOverviewPage } from '@/routes/workspace/WorkspaceOverviewPage'
import { WorkspaceSettingsPage } from '@/routes/workspace/WorkspaceSettingsPage'
import { WorkspaceTabPage } from '@/routes/workspace/WorkspaceTabPage'
import { WorkspaceToolGate } from '@/routes/workspace/WorkspaceToolGate'
import { DiagramsRedirect } from '@/routes/DiagramsRedirect'

export const router = createBrowserRouter([
  { path: '/', loader: () => redirect('/app') },
  {
    path: '/login',
    loader: loginLoader,
    // Loaded on demand: signed-in people never download the sign-in page.
    lazy: async () => ({ Component: (await import('@/routes/LoginPage')).LoginPage }),
    hydrateFallbackElement: <AuthLoading />,
    errorElement: <RouteErrorPage />,
  },
  // Email + password for the admin account (testing without a Google round trip). Loaded on demand, linked from nowhere.
  {
    path: '/admin-login',
    loader: loginLoader,
    lazy: async () => ({ Component: (await import('@/routes/AdminLoginPage')).AdminLoginPage }),
    hydrateFallbackElement: <AuthLoading />,
    errorElement: <RouteErrorPage />,
  },
  // Public: no loader, so no session is needed (linked from Google's consent screen).
  { path: '/privacy', element: <PrivacyPage />, errorElement: <RouteErrorPage /> },
  {
    path: '/auth/callback',
    loader: authCallbackLoader, // always redirects
    element: <AuthLoading label="Signing you in…" />,
    hydrateFallbackElement: <AuthLoading label="Signing you in…" />,
    errorElement: <RouteErrorPage />,
  },
  {
    // Everything under here requires a session (appLoader → requireUser).
    id: APP_ROUTE_ID,
    loader: appLoader,
    element: (
      <>
        {/* Signs out a person who has been away too long (features/auth, lib/inactivity). */}
        <InactivityGuard />
        <Outlet />
      </>
    ),
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <AuthLoading />,
    children: [
      // Redirects to the last/first team, or /onboarding when there are none.
      { path: 'app', loader: appIndexLoader, element: <AuthLoading /> },
      { path: 'onboarding', loader: onboardingLoader, element: <OnboardingPage /> },
      // Back from installing the DevDock GitHub App (verified by the github Edge Function).
      {
        path: 'github/callback',
        loader: githubCallbackLoader,
        element: <GitHubCallbackPage />,
        hydrateFallbackElement: <AuthLoading label="Connecting GitHub…" />,
      },
      {
        // Must be a team member (teamLoader). Renders the sidebar shell.
        path: 't/:teamSlug',
        loader: teamLoader,
        element: <AppLayout />,
        children: [
          {
            errorElement: <RouteErrorPage inline />,
            children: [
              { index: true, element: <TeamWorkspacesPage /> },
              { path: 'messages', handle: FULL_BLEED, element: <MessagesPage /> },
              { path: 'members', element: <TeamMembersPage /> },
              { path: 'settings', element: <TeamSettingsPage /> },
              // Team → Files (URL docs): group-wide docs and diagrams + those of every workspace the user can see.
              // Lazy page; filesLoader starts its queries alongside the chunk.
              { path: 'docs', loader: filesLoader, shouldRevalidate: filesShouldRevalidate, lazy: async () => ({ Component: (await import('@/routes/team/TeamDocsPage')).TeamDocsPage }) },
              { path: 'docs/:docId', loader: docLoader, element: <DocPage /> },
              // The old Diagrams list opens Files showing diagrams; diagram pages keep their URLs.
              { path: 'diagrams', element: <DiagramsRedirect /> },
              // Full-bleed: the canvas takes the whole area under the top bar (DiagramView sets its height).
              { path: 'diagrams/:diagramId', loader: diagramLoader, handle: FULL_BLEED, element: <DiagramPage /> },
              // Development groups: issues from every project (the page checks the group type).
              { path: 'issues', element: <TeamIssuesPage /> },
              // Group → Live: video sessions (Jitsi via JaaS) for the group and its workspaces.
              { path: 'live', element: <TeamLivePage /> },
              { path: 'live/:sessionId', loader: liveSessionLoader, lazy: async () => ({ Component: (await import('@/routes/LiveSessionPage')).LiveSessionPage }) },
              // Your own reminders in this group (private; not a workspace tool).
              // Loader and page are separate lazy chunks, fetched side by side on the first visit.
              {
                path: 'reminders',
                lazy: {
                  loader: async () => (await import('@/features/reminders/loaders')).remindersLoader,
                  Component: async () => (await import('@/routes/team/RemindersPage')).RemindersPage,
                },
              },
              {
                // Visible to team owners/admins and workspace members (workspaceLoader + RLS).
                path: 'w/:workspaceId',
                loader: workspaceLoader,
                element: <WorkspaceLayout />,
                children: [
                  { index: true, element: <WorkspaceOverviewPage /> },
                  { path: 'members', element: <WorkspaceMembersPage /> },
                  { path: 'settings', element: <WorkspaceSettingsPage /> },
                  {
                    // Files (URL docs): this workspace's docs and diagrams; open when either tool is on.
                    path: 'docs',
                    element: <WorkspaceToolGate tool={['docs', 'diagrams']} />,
                    children: [
                      { index: true, loader: filesLoader, shouldRevalidate: filesShouldRevalidate, lazy: async () => ({ Component: (await import('@/routes/workspace/WorkspaceDocsPage')).WorkspaceDocsPage }) },
                      { element: <WorkspaceToolGate tool="docs" />, children: [{ path: ':docId', loader: docLoader, element: <DocPage /> }] },
                    ],
                  },
                  {
                    // This workspace's diagrams; the list itself is Files.
                    path: 'diagrams',
                    element: <WorkspaceToolGate tool="diagrams" />,
                    children: [
                      { index: true, element: <DiagramsRedirect /> },
                      { path: ':diagramId', loader: diagramLoader, handle: FULL_BLEED, element: <DiagramPage /> },
                    ],
                  },
                  {
                    // Linear-style issues (workspace-only).
                    path: 'issues',
                    // Starts all the data the Issues pages need at once (see issuesLoader).
                    loader: issuesLoader,
                    element: <WorkspaceToolGate tool="issues" />,
                    children: [
                      { index: true, element: <WorkspaceIssuesPage /> },
                      { path: 'cycles', element: <IssueCyclesPage /> },
                      { path: 'cycles/:cycleNumber', loader: cycleLoader, element: <IssueCyclePage /> },
                      { path: ':issueNumber', loader: issueLoader, element: <IssuePage /> },
                    ],
                  },
                  {
                    // Course outline, lessons and class progress.
                    path: 'learning',
                    element: <WorkspaceToolGate tool="learning" />,
                    children: [
                      { index: true, element: <WorkspaceLearningPage /> },
                      { path: 'progress', element: <LearningProgressPage /> },
                      { path: ':lessonId', loader: lessonLoader, element: <LessonPage /> },
                    ],
                  },
                  {
                    // Only this workspace's live sessions.
                    path: 'live',
                    element: <WorkspaceToolGate tool="live" />,
                    children: [
                      { index: true, element: <WorkspaceLivePage /> },
                      { path: ':sessionId', loader: liveSessionLoader, lazy: async () => ({ Component: (await import('@/routes/LiveSessionPage')).LiveSessionPage }) },
                    ],
                  },
                  {
                    // The repos linked to this project (group repos; issues point at them).
                    path: 'github',
                    element: <WorkspaceToolGate tool="github" />,
                    children: [{ index: true, element: <WorkspaceGitHubPage /> }],
                  },
                  // Feature tabs that don't exist yet (Exercises); checked against the enabled tools.
                  { path: ':tab', element: <WorkspaceTabPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

// Signed in/out elsewhere (another tab, expired session): drop cached data from
// the previous identity and re-run loaders, which redirect as needed.
watchAuthIdentity(() => {
  queryClient.clear()
  void router.revalidate()
})
