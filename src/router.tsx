import { createBrowserRouter, redirect } from 'react-router'
import { AuthLoading } from '@/features/auth/components/AuthLoading'
import { authCallbackLoader, loginLoader } from '@/features/auth/loaders'
import { watchAuthIdentity } from '@/features/auth/session'
import { AppLayout } from '@/layouts/AppLayout'
import { APP_ROUTE_ID, appLoader } from '@/layouts/app-loader'
import { queryClient } from '@/lib/query-client'
import { HomePage } from '@/routes/HomePage'
import { LoginPage } from '@/routes/LoginPage'
import { NotFoundPage, RouteErrorPage } from '@/routes/NotFoundPage'
import { LessonsPage } from '@/routes/course/LessonsPage'
import { LiveClassPage } from '@/routes/course/LiveClassPage'
import { MembersPage } from '@/routes/course/MembersPage'
import { OverviewPage } from '@/routes/course/OverviewPage'
import { ResourcesPage } from '@/routes/course/ResourcesPage'
import { SettingsPage } from '@/routes/course/SettingsPage'

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
    // Everything under here requires a session (see appLoader → requireUser).
    id: APP_ROUTE_ID,
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <AuthLoading />,
    loader: appLoader,
    children: [
      { path: 'app', element: <HomePage /> },
      {
        path: 'courses/:courseId',
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'lessons', element: <LessonsPage /> },
          { path: 'live', element: <LiveClassPage /> },
          { path: 'resources', element: <ResourcesPage /> },
          { path: 'members', element: <MembersPage /> },
          { path: 'settings', element: <SettingsPage /> },
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
