import { ChevronsUpDown, LogOut, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { initials } from '@/lib/utils'
import { useSignOut, useUserIdentity } from '../hooks'

/**
 * Signed-in user in the sidebar footer: avatar + name. Clicking opens the
 * account menu upward, as wide as the sidebar (like ChatGPT's), with the email
 * in its header and Sign out.
 */
export function UserMenu() {
  const { name, email, avatarUrl, profileUnavailable } = useUserIdentity()
  const signOut = useSignOut()

  const avatar = (
    <Avatar className="size-8 rounded-full">
      {/* Google avatar URLs can reject requests that send a Referer. */}
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="rounded-full text-xs">{initials(name)}</AvatarFallback>
    </Avatar>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={name}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {avatar}
              <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{name}</span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={6}
            // As wide as the footer button (still readable when the sidebar is collapsed).
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-xl p-1.5"
          >
            <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-2 font-normal">
              {avatar}
              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{name}</span>
                {email && (
                  <span className="truncate text-xs text-muted-foreground" title={email}>
                    {email}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            {profileUnavailable && (
              <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                Profile couldn’t be loaded. Showing your Google account details.
              </p>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/privacy">
                <ShieldCheck />
                Privacy policy
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={signOut.isPending} onSelect={() => signOut.mutate()}>
              <LogOut />
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {signOut.isError && (
          <p role="alert" className="px-2 pt-1 text-xs text-destructive">
            {signOut.error.message}
          </p>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
