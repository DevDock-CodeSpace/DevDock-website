import { ExternalLink, FileText, FolderGit2, Link2, Workflow, type LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { formatLessonNumber } from '@/features/courses/format'
import type { ResourceKind } from '@/features/courses/types'
import { useCurrentCourse } from '@/features/courses/use-course'

const kinds: Record<ResourceKind, { label: string; icon: LucideIcon }> = {
  repo: { label: 'Repository', icon: FolderGit2 },
  doc: { label: 'Reading', icon: FileText },
  diagram: { label: 'Diagram', icon: Workflow },
  link: { label: 'Link', icon: Link2 },
}

export function ResourcesPage() {
  const course = useCurrentCourse()

  return (
    <>
      <PageHeader
        title="Resources"
        description="Repositories, readings, and diagrams shared with the class."
      />
      <ul className="divide-y rounded-lg border bg-card">
        {course.resources.map((resource) => {
          const { label, icon: Icon } = kinds[resource.kind]
          return (
            <li key={resource.id}>
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{resource.title}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
                {resource.lessonNumber !== undefined && (
                  <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
                    L{formatLessonNumber(resource.lessonNumber)}
                  </Badge>
                )}
                <ExternalLink className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </li>
          )
        })}
      </ul>
    </>
  )
}
