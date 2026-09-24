import { queryOptions } from '@tanstack/react-query'
import { mockCourses } from './mock-data'
import type { Course } from './types'

// Mock fetchers. Swap the bodies for Supabase calls later; callers stay the same.
async function fetchCourses(): Promise<Course[]> {
  return mockCourses
}

async function fetchCourse(courseId: string): Promise<Course> {
  const course = mockCourses.find((c) => c.id === courseId)
  if (!course) throw new Error(`Course "${courseId}" not found`)
  return course
}

export const coursesQuery = queryOptions({
  queryKey: ['courses'],
  queryFn: fetchCourses,
})

export const courseQuery = (courseId: string) =>
  queryOptions({
    queryKey: ['courses', courseId],
    queryFn: () => fetchCourse(courseId),
  })
