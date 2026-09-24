import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { LessonStatus } from './types'

const labels: Record<LessonStatus, string> = {
  completed: 'Completed',
  'in-progress': 'In progress',
  upcoming: 'Upcoming',
}

const dotColors: Record<LessonStatus, string> = {
  completed: 'bg-emerald-500',
  'in-progress': 'bg-amber-500',
  upcoming: 'bg-muted-foreground/40',
}

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal text-muted-foreground">
      <span className={cn('size-1.5 rounded-full', dotColors[status])} />
      {labels[status]}
    </Badge>
  )
}
