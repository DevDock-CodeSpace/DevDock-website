import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, MoreHorizontal, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NameDialog } from '@/components/NameDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrentTeam } from '@/features/teams/hooks'
import { lessonPath } from '@/features/teams/nav'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import {
  createLesson,
  deleteLesson,
  deleteModule,
  learningKeys,
  moveLesson,
  renameModule,
  reorderLessons,
  reorderModules,
  type LessonSummary,
} from '../api'
import { useLearning, useToggleDone, type OutlineModule } from '../hooks'
import { DoneToggle } from './DoneToggle'

/** Moves item `index` by `delta` in a list of ids. */
const shift = (ids: string[], index: number, delta: -1 | 1) => {
  const next = [...ids]
  ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
  return next
}

/**
 * One module in the course outline: numbered lessons with done checkboxes and
 * the module's progress. Managers can add lessons, rename, reorder and delete.
 */
export function ModuleSection({ module, index }: { module: OutlineModule; index: number }) {
  const { team } = useCurrentTeam()
  const { workspace, outline, done, canManage } = useLearning()
  const toggle = useToggleDone()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'rename' | 'lesson' | 'delete' | null>(null)
  const [deletingLesson, setDeletingLesson] = useState<LessonSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const doneCount = module.lessons.filter((l) => done.has(l.id)).length
  const moduleIds = outline.map((m) => m.id)

  const refresh = () => queryClient.invalidateQueries({ queryKey: learningKeys.all })
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action()
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <section aria-label={module.title} className="border-b pb-4">
      <div className="flex items-center gap-3 py-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs">
          {index + 1}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{module.title}</h2>
        {module.lessons.length > 0 && (
          <span className="font-mono text-xs text-muted-foreground">
            {doneCount}/{module.lessons.length}
          </span>
        )}
        {canManage && (
          <div className="flex items-center">
            <IconButton
              label="Move module up"
              disabled={index === 0}
              onClick={() => void run(() => reorderModules(workspace.id, shift(moduleIds, index, -1)))}
            >
              <ArrowUp />
            </IconButton>
            <IconButton
              label="Move module down"
              disabled={index === outline.length - 1}
              onClick={() => void run(() => reorderModules(workspace.id, shift(moduleIds, index, 1)))}
            >
              <ArrowDown />
            </IconButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${module.title} actions`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog('rename')}>Rename</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
                  Delete module
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {module.lessons.length === 0 ? (
        <p className="pb-2 pl-10 text-sm text-muted-foreground">No lessons yet.</p>
      ) : (
        <ol className="ml-3.5 border-l">
          {module.lessons.map((lesson, i) => {
            const isDone = done.has(lesson.id)
            return (
              <li key={lesson.id} className="group relative flex h-10 items-center gap-3 pr-1 pl-5 hover:bg-muted/50">
                <DoneToggle
                  done={isDone}
                  label={isDone ? `Mark “${lesson.title}” not done` : `Mark “${lesson.title}” done`}
                  onToggle={() => toggle.mutate({ lessonId: lesson.id, done: !isDone })}
                />
                <span className="w-9 shrink-0 font-mono text-xs text-muted-foreground">
                  {index + 1}.{i + 1}
                </span>
                <Link
                  to={lessonPath(team.slug, workspace.id, lesson.id)}
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm outline-none after:absolute after:inset-0',
                    isDone ? 'text-muted-foreground' : 'font-medium',
                  )}
                >
                  {lesson.title}
                </Link>
                {canManage && (
                  <div className="relative z-10 flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
                    <IconButton
                      label="Move lesson up"
                      disabled={i === 0}
                      onClick={() => void run(() => reorderLessons(module.id, shift(module.lessons.map((l) => l.id), i, -1)))}
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      label="Move lesson down"
                      disabled={i === module.lessons.length - 1}
                      onClick={() => void run(() => reorderLessons(module.id, shift(module.lessons.map((l) => l.id), i, 1)))}
                    >
                      <ArrowDown />
                    </IconButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${lesson.title} actions`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {outline.length > 1 && (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Move to module</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuLabel className="text-xs text-muted-foreground">Goes to the end</DropdownMenuLabel>
                              {outline
                                .filter((m) => m.id !== module.id)
                                .map((m) => (
                                  <DropdownMenuItem key={m.id} onSelect={() => void run(() => moveLesson(lesson.id, m.id))}>
                                    {m.title}
                                  </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        )}
                        {outline.length > 1 && <DropdownMenuSeparator />}
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeletingLesson(lesson)}>
                          Delete lesson
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {canManage && (
        <button
          type="button"
          onClick={() => setDialog('lesson')}
          className="mt-1 ml-3.5 inline-flex h-8 items-center gap-1.5 rounded-md px-5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" /> Add lesson
        </button>
      )}

      <NameDialog
        key={dialog === 'rename' ? `rename-${module.id}` : dialog === 'lesson' ? `lesson-${module.id}` : 'name-closed'}
        open={dialog === 'rename' || dialog === 'lesson'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === 'rename' ? `Rename “${module.title}”` : `New lesson in ${module.title}`}
        description={dialog === 'rename' ? 'Everyone in the course sees the new name.' : 'Give it a title; you’ll write it next.'}
        initialName={dialog === 'rename' ? module.title : ''}
        placeholder={dialog === 'rename' ? 'Week 1: Git basics' : 'Your first commit'}
        submitLabel={dialog === 'rename' ? 'Rename' : 'Create lesson'}
        onSubmit={async (name) => {
          if (dialog === 'rename') {
            await renameModule(module.id, name)
            await refresh()
          } else {
            const { id } = await createLesson(workspace.id, module.id, name)
            await refresh()
            void navigate(lessonPath(team.slug, workspace.id, id))
          }
        }}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete “${module.title}”?`}
        description={`Its ${module.lessons.length} ${module.lessons.length === 1 ? 'lesson' : 'lessons'} and everyone’s progress on them are deleted too. This can’t be undone.`}
        confirmLabel="Delete module"
        pending={busy}
        onConfirm={async () => {
          setBusy(true)
          await run(() => deleteModule(module.id))
          setBusy(false)
          setDialog(null)
        }}
      />
      <ConfirmDialog
        open={deletingLesson !== null}
        onOpenChange={(o) => !o && setDeletingLesson(null)}
        title={`Delete “${deletingLesson?.title}”?`}
        description="Everyone’s progress on it is deleted too. This can’t be undone."
        confirmLabel="Delete lesson"
        pending={busy}
        onConfirm={async () => {
          if (!deletingLesson) return
          setBusy(true)
          await run(() => deleteLesson(deletingLesson.id))
          setBusy(false)
          setDeletingLesson(null)
        }}
      />
    </section>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}
