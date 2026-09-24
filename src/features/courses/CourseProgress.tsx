import type { Lesson } from './types'

export function CourseProgress({ lessons }: { lessons: Lesson[] }) {
  const done = lessons.filter((l) => l.status === 'completed').length
  const percent = lessons.length ? Math.round((done / lessons.length) * 100) : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>
          {done}/{lessons.length} lessons
        </span>
        <span>{percent}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
