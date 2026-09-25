import {
  BookOpen,
  FolderGit2,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  title: string
  to: string
  icon: LucideIcon
  /** Match the path exactly (for index routes). */
  end?: boolean
}

export const workspacePath = (slug: string) => `/w/${slug}`
export const coursePath = (slug: string, courseId: string) => `/w/${slug}/courses/${courseId}`

export function getWorkspaceNav(slug: string): NavItem[] {
  const base = workspacePath(slug)
  return [
    { title: 'Courses', to: base, icon: GraduationCap, end: true },
    { title: 'Members', to: `${base}/members`, icon: Users },
    { title: 'Settings', to: `${base}/settings`, icon: Settings },
  ]
}

export function getCourseNav(slug: string, courseId: string): NavItem[] {
  const base = coursePath(slug, courseId)
  return [
    { title: 'Overview', to: base, icon: LayoutDashboard, end: true },
    { title: 'Lessons', to: `${base}/lessons`, icon: BookOpen },
    { title: 'Live Class', to: `${base}/live`, icon: Video },
    { title: 'Resources', to: `${base}/resources`, icon: FolderGit2 },
    { title: 'Members', to: `${base}/members`, icon: Users },
    { title: 'Settings', to: `${base}/settings`, icon: Settings },
  ]
}
