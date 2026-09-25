import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouteLoaderData } from 'react-router'
import { APP_ROUTE_ID, type appLoader } from '@/layouts/app-loader'
import { profileQuery, signInWithGoogle, signOut } from './api'

/** The signed-in user. Only usable inside the authenticated app layout. */
export function useAuth() {
  const data = useRouteLoaderData<typeof appLoader>(APP_ROUTE_ID)
  if (!data) throw new Error('useAuth must be used inside the authenticated app layout.')
  return data
}

export function useCurrentProfile() {
  const { user } = useAuth()
  return useQuery(profileQuery(user.id))
}

/** Name/avatar to show for the current user: profile first, Google account metadata as fallback. */
export function useUserIdentity() {
  const { user } = useAuth()
  const profile = useCurrentProfile()
  const meta = user.user_metadata
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)

  return {
    email: user.email ?? null,
    name:
      text(profile.data?.display_name) ??
      text(meta.full_name) ??
      text(meta.name) ??
      user.email ??
      'Signed in',
    avatarUrl: text(profile.data?.avatar_url) ?? text(meta.avatar_url) ?? text(meta.picture),
    profileUnavailable: profile.isError,
  }
}

export function useSignInWithGoogle(next: string) {
  return useMutation({ mutationFn: () => signInWithGoogle(next) })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      // Drop anything fetched as this user before the next screen renders.
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })
}
