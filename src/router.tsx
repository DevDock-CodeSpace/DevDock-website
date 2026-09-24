import { createBrowserRouter, Navigate } from 'react-router'
import { courseQuery, coursesQuery } from '@/features/courses/api'
import { DEMO_COURSE_ID } from '@/features/courses/mock-data'
import { AppLayout } from '@/layouts/AppLayout'
import { queryClient } from '@/lib/query-client'
import { HomePage } from '@/routes/HomePage'
import { NotFoundPage, RouteErrorPage } from '@/routes/NotFoundPage'
import { LessonsPage } from '@/routes/course/LessonsPage'
import { LiveClassPage } from '@/routes/course/LiveClassPage'
import { MembersPage } from '@/routes/course/MembersPage'
import { OverviewPage } from '@/routes/course/OverviewPage'
import { ResourcesPage } from '@/routes/course/ResourcesPage'
import { SettingsPage } from '@/routes/course/SettingsPage'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <div className="min-h-svh bg-background" />,
    // Prime the cache so pages can read with useSuspenseQuery without suspending.
    loader: async ({ params }) => {
      await Promise.all([
        queryClient.ensureQueryData(coursesQuery),
        queryClient.ensureQueryData(courseQuery(params.courseId ?? DEMO_COURSE_ID)),
      ])
      return null
    },
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
