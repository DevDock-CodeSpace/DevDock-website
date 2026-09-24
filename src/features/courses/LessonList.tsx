import { Clock } from 'lucide-react'
import { formatLessonNumber } from './format'
import { LessonStatusBadge } from './LessonStatusBadge'
import type { Lesson } from './types'

export function LessonList({ lessons }: { lessons: Lesson[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {lessons.map((lesson) => (
        <li key={lesson.id} className="flex items-center gap-4 px-4 py-3">
          <span className="w-6 shrink-0 font-mono text-sm text-muted-foreground">
            {formatLessonNumber(lesson.number)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{lesson.title}</p>
            <p className="truncate text-sm text-muted-foreground">{lesson.summary}</p>
          </div>
          <span className="hidden items-center gap-1 font-mono text-xs text-muted-foreground sm:flex">
            <Clock className="size-3" />
            {lesson.durationMinutes}m
          </span>
          <LessonStatusBadge status={lesson.status} />
        </li>
      ))}
    </ul>
  )
}
