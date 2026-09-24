import { PageHeader } from '@/components/PageHeader'
import { LessonList } from '@/features/courses/LessonList'
import { useCurrentCourse } from '@/features/courses/use-course'

export function LessonsPage() {
  const course = useCurrentCourse()

  return (
    <>
      <PageHeader
        title="Lessons"
        description={`${course.lessons.length} lessons in ${course.title}.`}
      />
      <LessonList lessons={course.lessons} />
    </>
  )
}
