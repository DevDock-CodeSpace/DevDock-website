import { createBrowserRouter, Outlet, redirect } from 'react-router'
import { AuthLoading } from '@/features/auth/components/AuthLoading'
import { authCallbackLoader, loginLoader } from '@/features/auth/loaders'
import { watchAuthIdentity } from '@/features/auth/session'
import { docLoader } from '@/features/docs/loaders'
import { TEAM_TOOLS } from '@/features/teams/nav'
import { appIndexLoader, onboardingLoader, teamLoader, workspaceLoader } from '@/features/teams/loaders'
import { AppLayout } from '@/layouts/AppLayout'
import { APP_ROUTE_ID, appLoader } from '@/layouts/app-loader'
import { queryClient } from '@/lib/query-client'
import { DocPage } from '@/routes/DocPage'
import { LoginPage } from '@/routes/LoginPage'
import { NotFoundPage, RouteErrorPage } from '@/routes/NotFoundPage'
import { OnboardingPage } from '@/routes/OnboardingPage'
import { TeamDocsPage } from '@/routes/team/TeamDocsPage'
import { TeamMembersPage } from '@/routes/team/TeamMembersPage'
import { TeamSettingsPage } from '@/routes/team/TeamSettingsPage'
import { TeamToolPage } from '@/routes/team/TeamToolPage'
import { TeamWorkspacesPage } from '@/routes/team/TeamWorkspacesPage'
import { WorkspaceDocsPage } from '@/routes/workspace/WorkspaceDocsPage'
import { WorkspaceLayout } from '@/routes/workspace/WorkspaceLayout'
import { WorkspaceMembersPage } from '@/routes/workspace/WorkspaceMembersPage'
import { WorkspaceOverviewPage } from '@/routes/workspace/WorkspaceOverviewPage'
import { WorkspaceSettingsPage } from '@/routes/workspace/WorkspaceSettingsPage'
import { WorkspaceTabPage } from '@/routes/workspace/WorkspaceTabPage'
import { WorkspaceToolGate } from '@/routes/workspace/WorkspaceToolGate'

export const router = createBrowserRouter([
  { path: '/', loader: () => redirect('/app') },
  {
    path: '/login',
    loader: loginLoader,
    element: <LoginPage />,
    hydrateFallbackElement: <AuthLoading />,
    errorElement: <RouteErrorPage />,
  },
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
    element: <Outlet />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <AuthLoading />,
    children: [
      // Redirects to the last/first team, or /onboarding when there are none.
      { path: 'app', loader: appIndexLoader, element: <AuthLoading /> },
      { path: 'onboarding', loader: onboardingLoader, element: <OnboardingPage /> },
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
              { path: 'members', element: <TeamMembersPage /> },
              { path: 'settings', element: <TeamSettingsPage /> },
              // Team → Docs: team-wide docs + docs of every workspace the user can see.
              { path: 'docs', element: <TeamDocsPage /> },
              { path: 'docs/:docId', loader: docLoader, element: <DocPage /> },
              // Team-wide views of tools not built yet (Diagrams, Live): placeholders.
              ...TEAM_TOOLS.filter((tool) => tool !== 'docs').map((tool) => ({
                path: tool,
                element: <TeamToolPage tool={tool} />,
              })),
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
                    // Only docs assigned to this workspace.
                    path: 'docs',
                    element: <WorkspaceToolGate tool="docs" />,
                    children: [
                      { index: true, element: <WorkspaceDocsPage /> },
                      { path: ':docId', loader: docLoader, element: <DocPage /> },
                    ],
                  },
                  // Feature tabs that don't exist yet (Diagrams, Live, …); checked against the enabled tools.
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
