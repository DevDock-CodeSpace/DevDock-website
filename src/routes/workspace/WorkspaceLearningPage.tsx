import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BarChart3, BookOpen, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { NameDialog } from '@/components/NameDialog'
import { Button } from '@/components/ui/button'
import { createModule, learningKeys } from '@/features/learning/api'
import { ModuleSection } from '@/features/learning/components/ModuleSection'
import { useLearning } from '@/features/learning/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { learningProgressPath, lessonPath } from '@/features/teams/nav'

/**
 * Workspace → Learning: the course outline (modules → lessons), your progress
 * and a Continue button. Leads and group owners/admins edit the outline and
 * see everyone's progress.
 */
export function WorkspaceLearningPage() {
  const { team } = useCurrentTeam()
  const { workspace, outline, ordered, done, next, canManage } = useLearning()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const percent = ordered.length === 0 ? 0 : Math.round((done.size / ordered.length) * 100)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium">Your progress</p>
          <div className="flex items-center gap-3">
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {done.size}/{ordered.length} lessons · {percent}%
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              <Button size="sm" variant="ghost" asChild>
                <Link to={learningProgressPath(team.slug, workspace.id)}>
                  <BarChart3 /> Class progress
                </Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                <Plus /> New module
              </Button>
            </>
          )}
          {next ? (
            <Button size="sm" asChild>
              <Link to={lessonPath(team.slug, workspace.id, next.id)}>
                {done.size === 0 ? 'Start' : 'Continue'}: <span className="max-w-48 truncate">{next.title}</span>
                <ArrowRight />
              </Link>
            </Button>
          ) : (
            ordered.length > 0 && <span className="text-sm font-medium text-brand">All lessons done</span>
          )}
        </div>
      </div>

      {outline.length === 0 ? (
        <div className="border-y py-12 text-center">
          <BookOpen className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No lessons yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {canManage
              ? 'Organize the course into modules (Week 1, Week 2…) and add lessons to each.'
              : 'The workspace lead hasn’t added any lessons yet.'}
          </p>
          {canManage && (
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setCreating(true)}>
              <Plus /> Create the first module
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {outline.map((module, index) => (
            <ModuleSection key={module.id} module={module} index={index} />
          ))}
        </div>
      )}

      <NameDialog
        key={creating ? 'module-open' : 'module-closed'}
        open={creating}
        onOpenChange={setCreating}
        title="New module"
        description="Modules group lessons, like weeks or topics. New modules go at the end."
        placeholder={`Week ${outline.length + 1}`}
        submitLabel="Create module"
        onSubmit={async (name) => {
          await createModule(workspace.id, name)
          await queryClient.invalidateQueries({ queryKey: learningKeys.all })
        }}
      />
    </>
  )
}
