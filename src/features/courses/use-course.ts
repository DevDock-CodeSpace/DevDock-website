import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { courseQuery } from './api'
import { DEMO_COURSE_ID } from './mock-data'

/** The course for the current `/courses/:courseId` route. */
export function useCurrentCourse() {
  const { courseId = DEMO_COURSE_ID } = useParams()
  return useSuspenseQuery(courseQuery(courseId)).data
}
