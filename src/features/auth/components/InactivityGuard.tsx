import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useInactivityLogout } from '@/hooks/use-inactivity-logout'
import { INACTIVE_REASON, INACTIVITY_LIMIT_MS, WARNING_MS } from '@/lib/inactivity-config'
import { queryClient } from '@/lib/query-client'
import { signOutForInactivity } from '../api'
import { safeNextPath } from '../redirect'

/**
 * Signs out a person who has been away for INACTIVITY_LIMIT_MS, asking first.
 * Rendered once on the `app` route, so only where there is a session.
 */
export function InactivityGuard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [deadline, setDeadline] = useState<number | null>(null)
  const here = location.pathname + location.search

  const onLogout = useCallback(async () => {
    await signOutForInactivity()
    setDeadline(null)
    // Drop anything fetched as this user before the next screen renders.
    queryClient.clear()
    const search = new URLSearchParams({ reason: INACTIVE_REASON })
    const next = safeNextPath(here)
    if (next !== '/app') search.set('next', next)
    navigate(`/login?${search}`, { replace: true })
  }, [navigate, here])

  const { staySignedIn } = useInactivityLogout({ limitMs: INACTIVITY_LIMIT_MS, warningMs: WARNING_MS, onWarn: setDeadline, onLogout })

  if (deadline === null) return null
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You’ll be signed out in <Countdown key={deadline} deadline={deadline} /> because you haven’t used DevDock for a while.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button autoFocus onClick={staySignedIn}>
            Stay signed in
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const secondsLeft = (deadline: number) => Math.max(0, Math.ceil((deadline - Date.now()) / 1000))

function Countdown({ deadline }: { deadline: number }) {
  const [seconds, setSeconds] = useState(() => secondsLeft(deadline))
  useEffect(() => {
    const id = window.setInterval(() => setSeconds(secondsLeft(deadline)), 1000)
    return () => window.clearInterval(id)
  }, [deadline])
  return <span className="font-mono tabular-nums">{seconds}s</span>
}
