import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentCourse } from '@/features/courses/use-course'

export function SettingsPage() {
  const course = useCurrentCourse()
  const fields = [
    { label: 'Title', value: course.title },
    { label: 'Code', value: course.code, mono: true },
    { label: 'URL', value: `/courses/${course.id}`, mono: true },
    { label: 'Description', value: course.description },
  ]

  return (
    <>
      <PageHeader title="Settings" description="Course configuration." />
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Read-only for now. Editing arrives with the backend.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            {fields.map((field) => (
              <div key={field.label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <dt className="text-sm text-muted-foreground">{field.label}</dt>
                <dd className={field.mono ? 'font-mono text-sm' : 'text-sm'}>{field.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  )
}
