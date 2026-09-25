import { createBrowserRouter, Outlet, redirect } from 'react-router'
import { AuthLoading } from '@/features/auth/components/AuthLoading'
import { authCallbackLoader, loginLoader } from '@/features/auth/loaders'
import { watchAuthIdentity } from '@/features/auth/session'
import { appIndexLoader, onboardingLoader, teamLoader, workspaceLoader } from '@/features/teams/loaders'
import { AppLayout } from '@/layouts/AppLayout'
import { APP_ROUTE_ID, appLoader } from '@/layouts/app-loader'
import { queryClient } from '@/lib/query-client'
import { LoginPage } from '@/routes/LoginPage'
import { NotFoundPage, RouteErrorPage } from '@/routes/NotFoundPage'
import { OnboardingPage } from '@/routes/OnboardingPage'
import { TeamMembersPage } from '@/routes/team/TeamMembersPage'
import { TeamSettingsPage } from '@/routes/team/TeamSettingsPage'
import { TeamWorkspacesPage } from '@/routes/team/TeamWorkspacesPage'
import { WorkspaceLayout } from '@/routes/workspace/WorkspaceLayout'
import { WorkspaceMembersPage } from '@/routes/workspace/WorkspaceMembersPage'
import { WorkspaceOverviewPage } from '@/routes/workspace/WorkspaceOverviewPage'
import { WorkspaceSettingsPage } from '@/routes/workspace/WorkspaceSettingsPage'
import { WorkspaceTabPage } from '@/routes/workspace/WorkspaceTabPage'

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
              {
                // Visible to team owners/admins and workspace members (workspaceLoader + RLS).
                path: 'w/:workspaceId',
                loader: workspaceLoader,
                element: <WorkspaceLayout />,
                children: [
                  { index: true, element: <WorkspaceOverviewPage /> },
                  { path: 'members', element: <WorkspaceMembersPage /> },
                  { path: 'settings', element: <WorkspaceSettingsPage /> },
                  // Feature tabs that don't exist yet (Docs, Live, …); validated per workspace type.
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
