export type LessonStatus = 'completed' | 'in-progress' | 'upcoming'

export type Lesson = {
  id: string
  number: number
  title: string
  summary: string
  status: LessonStatus
  durationMinutes: number
}

export type MemberRole = 'instructor' | 'student'

export type Member = {
  id: string
  name: string
  handle: string
  role: MemberRole
}

export type ResourceKind = 'repo' | 'doc' | 'diagram' | 'link'

export type Resource = {
  id: string
  title: string
  kind: ResourceKind
  url: string
  lessonNumber?: number
}

export type LiveSession = {
  id: string
  title: string
  startsAt: string
  durationMinutes: number
  lessonNumber: number
}

export type Course = {
  id: string
  title: string
  code: string
  description: string
  lessons: Lesson[]
  members: Member[]
  resources: Resource[]
  sessions: LiveSession[]
}
