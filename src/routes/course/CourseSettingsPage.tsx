import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { courseQuery, deleteCourse, updateCourse } from '@/features/courses/api'
import { useCurrentCourse, useCurrentWorkspace } from '@/features/workspaces/hooks'
import { workspacePath } from '@/features/workspaces/nav'
import { errorMessage } from '@/lib/errors'

export function CourseSettingsPage() {
  const { course, can } = useCurrentCourse()

  if (!can.canEdit) {
    return (
      <>
        <PageHeader title="Settings" />
        <p className="text-sm text-muted-foreground">Only the course lead and workspace owners/admins can change course settings.</p>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Settings" description="Course details." />
      <div className="space-y-6">
        <DetailsCard key={course.updated_at} />
        {can.canDelete && <DeleteCourseCard />}
      </div>
    </>
  )
}

function DetailsCard() {
  const { workspace } = useCurrentWorkspace()
  const { course } = useCurrentCourse()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(course.title)
  const [description, setDescription] = useState(course.description ?? '')
  const dirty = title.trim() !== course.title || description.trim() !== (course.description ?? '')

  const save = useMutation({
    mutationFn: () => updateCourse(course.id, { title, description }),
    onSuccess: () => {
      toast.success('Course saved')
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: courseQuery(course.id).queryKey }),
        queryClient.invalidateQueries({ queryKey: ['courses', 'workspace', workspace.id] }),
      ])
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (dirty && title.trim()) save.mutate()
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Shown to everyone in the course.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="course-title">Title</Label>
            <Input id="course-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-description">Description</Label>
            <Textarea
              id="course-description"
              value={description}
              maxLength={5000}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!dirty || !title.trim() || save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function DeleteCourseCard() {
  const { workspace } = useCurrentWorkspace()
  const { course } = useCurrentCourse()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const remove = useMutation({
    mutationFn: () => deleteCourse(course.id),
    onSuccess: async () => {
      toast.success(`${course.title} was deleted`)
      // Leave the page before dropping its data (see useExitWorkspace for why).
      await navigate(workspacePath(workspace.slug), { replace: true })
      queryClient.removeQueries({ queryKey: ['courses', course.id] })
      await queryClient.invalidateQueries({ queryKey: ['courses', 'workspace', workspace.id] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle>Delete course</CardTitle>
        <CardDescription>Removes the course and everyone’s access to it. People stay in the workspace.</CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Delete course
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${course.title}?`}
        description="This can’t be undone."
        confirmLabel="Delete course"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  )
}
