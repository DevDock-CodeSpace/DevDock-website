import { BookOpen, FolderGit2, LayoutDashboard, Settings, Users, Video, type LucideIcon } from 'lucide-react'

export type CourseNavItem = {
  title: string
  to: string
  icon: LucideIcon
  /** Match the path exactly (used for the course root). */
  end?: boolean
}

export function getCourseNav(courseId: string): CourseNavItem[] {
  const base = `/courses/${courseId}`
  return [
    { title: 'Overview', to: base, icon: LayoutDashboard, end: true },
    { title: 'Lessons', to: `${base}/lessons`, icon: BookOpen },
    { title: 'Live Class', to: `${base}/live`, icon: Video },
    { title: 'Resources', to: `${base}/resources`, icon: FolderGit2 },
    { title: 'Members', to: `${base}/members`, icon: Users },
    { title: 'Settings', to: `${base}/settings`, icon: Settings },
  ]
}
