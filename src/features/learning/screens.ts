import { preloadable } from '@/lib/preloadable'

/** The lesson editor: loaded with the lesson by lessonLoader. */
export const lessonView = preloadable(() => import('./components/LessonView'))
