import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createCourse } from '@/features/courses/api'
import { useCurrentWorkspace } from '@/features/workspaces/hooks'
import { coursePath } from '@/features/workspaces/nav'

export function CreateCourseDialog() {
  const { workspace } = useCurrentWorkspace()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () => createCourse(workspace.id, { title, description }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['courses'] })
      setOpen(false)
      navigate(coursePath(workspace.slug, id))
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (title.trim()) create.mutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setTitle('')
          setDescription('')
          create.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> New course
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New course</DialogTitle>
            <DialogDescription>
              Only workspace owners and admins see it until you add people to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="course-title">Title</Label>
            <Input
              id="course-title"
              value={title}
              maxLength={200}
              placeholder="Software Engineering Fundamentals"
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-description">Description</Label>
            <Textarea
              id="course-description"
              value={description}
              maxLength={5000}
              rows={3}
              placeholder="What will students learn?"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-destructive">
              {create.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {create.isPending && <LoaderCircle className="animate-spin" />}
              Create course
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
