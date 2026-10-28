import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, LogOut } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { LogoWordmark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { adminFeedbackQuery } from '@/features/admin/api'
import { useSignOut, useUserIdentity } from '@/features/auth/hooks'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/groups', label: 'Groups', end: false },
  { to: '/admin/users', label: 'Users', end: false },
  { to: '/admin/flags', label: 'Feature flags', end: false },
  { to: '/admin/feedback', label: 'Feedback', end: false },
]

/**
 * The platform admin console's shell (/admin): its own top bar and tabs, not the group sidebar,
 * because the admin belongs to no group. Lazy, so nobody else downloads it.
 */
export function AdminLayout() {
  const { email } = useUserIdentity()
  const signOut = useSignOut()
  // How the admin hears about new feedback (there's no email yet): a count on its tab, on every console page.
  // useQuery, so the tabs never wait for it; adminLoader started it.
  const newFeedback = useQuery(adminFeedbackQuery()).data?.filter((f) => f.status === 'new').length ?? 0

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b">
        <div className="flex h-12 items-center gap-3 px-4 sm:px-6">
          <LogoWordmark className="h-5 w-auto" />
          <span className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">Admin</span>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            {email && <span className="hidden truncate text-sm text-muted-foreground sm:inline">{email}</span>}
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
              {signOut.isPending ? <LoaderCircle className="animate-spin" /> : <LogOut />}
              Sign out
            </Button>
          </div>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-2 sm:px-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  '-mb-px shrink-0 border-b-2 px-2.5 py-2 text-sm transition-colors',
                  isActive ? 'border-brand font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              {item.label}
              {item.to === '/admin/feedback' && newFeedback > 0 && (
                <span data-new-feedback={newFeedback} className="ml-1.5 rounded-full bg-brand px-1.5 py-px font-mono text-[11px] text-white tabular-nums">
                  {newFeedback}
                  <span className="sr-only"> new</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 px-4 py-6 sm:px-6">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
