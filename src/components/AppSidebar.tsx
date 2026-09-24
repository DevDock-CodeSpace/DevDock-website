import { Link, matchPath, useLocation } from 'react-router'
import { LogoMark, LogoWordmark } from '@/components/Logo'
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
import { UserMenu } from '@/features/auth/components/UserMenu'
import { getCourseNav } from '@/features/courses/nav'
import { useCurrentCourse } from '@/features/courses/use-course'

export function AppSidebar() {
  const course = useCurrentCourse()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="DevDock home">
              <Link to="/app" onClick={closeOnMobile}>
                <LogoMark className="size-8 object-contain" />
                <LogoWordmark className="h-[18px]" />
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

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
