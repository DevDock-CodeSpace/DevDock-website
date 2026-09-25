import { ChevronsUpDown, LogOut } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { initials } from '@/lib/utils'
import { useSignOut, useUserIdentity } from '../hooks'

/** Signed-in user in the sidebar footer, with a menu to sign out. */
export function UserMenu() {
  const { name, email, avatarUrl, profileUnavailable } = useUserIdentity()
  const signOut = useSignOut()
  const { isMobile } = useSidebar()

  const avatar = (
    <Avatar className="size-8 rounded-md">
      {/* Google avatar URLs can reject requests that send a Referer. */}
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="rounded-md text-xs">{initials(name)}</AvatarFallback>
    </Avatar>
  )
  const details = (
    <div className="grid flex-1 text-left leading-tight">
      <span className="truncate text-sm font-medium">{name}</span>
      {email && <span className="truncate font-mono text-xs text-muted-foreground">{email}</span>}
    </div>
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
              {details}
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
            className="min-w-56"
          >
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              {avatar}
              {details}
            </DropdownMenuLabel>
            {profileUnavailable && (
              <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                Profile couldn’t be loaded. Showing your Google account details.
              </p>
            )}
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
