import { SquareTerminal } from 'lucide-react'
import { Link, matchPath, useLocation } from 'react-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { initials } from '@/features/courses/format'
import { getCourseNav } from '@/features/courses/nav'
import { useCurrentCourse } from '@/features/courses/use-course'

export function AppSidebar() {
  const course = useCurrentCourse()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }
  // TEMPORARY: mock signed-in user until auth exists.
  const instructor = course.members.find((m) => m.role === 'instructor')

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="DevDoc home">
              <Link to="/app" onClick={closeOnMobile}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <SquareTerminal className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">DevDoc</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">workspace</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono">{course.code}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {getCourseNav(course.id).map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null}
                  >
                    <Link to={item.to} onClick={closeOnMobile}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {instructor && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip={instructor.name}>
                <Avatar className="size-8 rounded-md">
                  <AvatarFallback className="rounded-md text-xs">
                    {initials(instructor.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">{instructor.name}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    @{instructor.handle}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  )
}
