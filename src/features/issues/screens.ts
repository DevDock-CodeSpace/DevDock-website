import { preloadable } from '@/lib/preloadable'

/** The issue page body (with the description editor): loaded with the issue by issueLoader. */
export const issueView = preloadable(() => import('./components/IssueView'))
