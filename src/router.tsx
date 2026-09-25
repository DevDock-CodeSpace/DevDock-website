import { BookOpen, FolderGit2, Video } from 'lucide-react'
import { createBrowserRouter, Outlet, redirect } from 'react-router'
import { AuthLoading } from '@/features/auth/components/AuthLoading'
import { authCallbackLoader, loginLoader } from '@/features/auth/loaders'
import { watchAuthIdentity } from '@/features/auth/session'
import { appIndexLoader, courseLoader, onboardingLoader, workspaceLoader } from '@/features/workspaces/loaders'
import { AppLayout } from '@/layouts/AppLayout'
import { APP_ROUTE_ID, appLoader } from '@/layouts/app-loader'
import { queryClient } from '@/lib/query-client'
import { LoginPage } from '@/routes/LoginPage'
import { NotFoundPage, RouteErrorPage } from '@/routes/NotFoundPage'
import { OnboardingPage } from '@/routes/OnboardingPage'
import { ComingSoonPage } from '@/routes/course/ComingSoonPage'
import { CourseMembersPage } from '@/routes/course/CourseMembersPage'
import { CourseOverviewPage } from '@/routes/course/CourseOverviewPage'
import { CourseSettingsPage } from '@/routes/course/CourseSettingsPage'
import { CoursesPage } from '@/routes/workspace/CoursesPage'
import { WorkspaceMembersPage } from '@/routes/workspace/WorkspaceMembersPage'
import { WorkspaceSettingsPage } from '@/routes/workspace/WorkspaceSettingsPage'

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
      // Redirects to the last/first workspace, or /onboarding when there are none.
      { path: 'app', loader: appIndexLoader, element: <AuthLoading /> },
      { path: 'onboarding', loader: onboardingLoader, element: <OnboardingPage /> },
      {
        // Must be a member (workspaceLoader). Renders the sidebar shell.
        path: 'w/:workspaceSlug',
        loader: workspaceLoader,
        element: <AppLayout />,
        children: [
          {
            errorElement: <RouteErrorPage inline />,
            children: [
              { index: true, element: <CoursesPage /> },
              { path: 'members', element: <WorkspaceMembersPage /> },
              { path: 'settings', element: <WorkspaceSettingsPage /> },
              {
                // Visible to workspace owners/admins and course members (courseLoader + RLS).
                path: 'courses/:courseId',
                loader: courseLoader,
                children: [
                  { index: true, element: <CourseOverviewPage /> },
                  {
                    path: 'lessons',
                    element: (
                      <ComingSoonPage
                        title="Lessons"
                        icon={BookOpen}
                        description="Lessons will live here once the lesson editor ships."
                      />
                    ),
                  },
                  {
                    path: 'live',
                    element: (
                      <ComingSoonPage
                        title="Live Class"
                        icon={Video}
                        description="Scheduled sessions and the live room (Jitsi) are coming in a later phase."
                      />
                    ),
                  },
                  {
                    path: 'resources',
                    element: (
                      <ComingSoonPage
                        title="Resources"
                        icon={FolderGit2}
                        description="Links, repositories, and diagrams shared with the course are coming soon."
                      />
                    ),
                  },
                  { path: 'members', element: <CourseMembersPage /> },
                  { path: 'settings', element: <CourseSettingsPage /> },
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
