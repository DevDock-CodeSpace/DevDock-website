// TEMPORARY: visual-development fixtures. Replaced by Supabase queries in a later phase.
import type { Course } from './types'

export const DEMO_COURSE_ID = 'demo'

export const mockCourses: Course[] = [
  {
    id: DEMO_COURSE_ID,
    title: 'Software Engineering Fundamentals',
    code: 'SEF-101',
    description:
      'From the command line to shipping a React app: the tools and habits working engineers use every day.',
    lessons: [
      { id: 'l1', number: 1, title: 'Computer Basics', summary: 'Files, processes, memory, and how programs actually run.', status: 'completed', durationMinutes: 60 },
      { id: 'l2', number: 2, title: 'Terminal', summary: 'Shell navigation, pipes, environment variables, and scripting basics.', status: 'completed', durationMinutes: 75 },
      { id: 'l3', number: 3, title: 'Git Fundamentals', summary: 'Commits, branches, merges, and reading history.', status: 'completed', durationMinutes: 90 },
      { id: 'l4', number: 4, title: 'GitHub', summary: 'Remotes, pull requests, code review, and issues.', status: 'in-progress', durationMinutes: 75 },
      { id: 'l5', number: 5, title: 'JavaScript', summary: 'Types, functions, closures, async/await, and modules.', status: 'upcoming', durationMinutes: 120 },
      { id: 'l6', number: 6, title: 'Node.js', summary: 'The runtime, npm, the file system, and small CLIs.', status: 'upcoming', durationMinutes: 90 },
      { id: 'l7', number: 7, title: 'React', summary: 'Components, state, effects, and building a small app.', status: 'upcoming', durationMinutes: 120 },
      { id: 'l8', number: 8, title: 'APIs', summary: 'HTTP, REST, JSON, and consuming APIs from the frontend.', status: 'upcoming', durationMinutes: 90 },
    ],
    members: [
      { id: 'm1', name: 'Alex Rivera', handle: 'arivera', role: 'instructor' },
      { id: 'm2', name: 'Sam Chen', handle: 'samchen', role: 'student' },
      { id: 'm3', name: 'Priya Nair', handle: 'pnair', role: 'student' },
      { id: 'm4', name: 'Jordan Blake', handle: 'jblake', role: 'student' },
      { id: 'm5', name: 'Taylor Okafor', handle: 'tokafor', role: 'student' },
    ],
    resources: [
      { id: 'r1', title: 'Pro Git (book)', kind: 'doc', url: 'https://git-scm.com/book/en/v2', lessonNumber: 3 },
      { id: 'r2', title: 'Git branching model', kind: 'diagram', url: '#', lessonNumber: 3 },
      { id: 'r3', title: 'Starter repo: hello-github', kind: 'repo', url: 'https://github.com/', lessonNumber: 4 },
      { id: 'r4', title: 'MDN JavaScript Guide', kind: 'doc', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', lessonNumber: 5 },
      { id: 'r5', title: 'Node.js docs', kind: 'link', url: 'https://nodejs.org/docs/latest/api/', lessonNumber: 6 },
      { id: 'r6', title: 'React docs: Quick Start', kind: 'link', url: 'https://react.dev/learn', lessonNumber: 7 },
      { id: 'r7', title: 'Request lifecycle', kind: 'diagram', url: '#', lessonNumber: 8 },
    ],
    sessions: [
      { id: 's1', title: 'Pull requests & code review', startsAt: '2026-09-28T17:00:00Z', durationMinutes: 75, lessonNumber: 4 },
      { id: 's2', title: 'JavaScript essentials', startsAt: '2026-10-05T17:00:00Z', durationMinutes: 90, lessonNumber: 5 },
      { id: 's3', title: 'Branching and merging', startsAt: '2026-09-21T17:00:00Z', durationMinutes: 90, lessonNumber: 3 },
      { id: 's4', title: 'Terminal workflows', startsAt: '2026-09-14T17:00:00Z', durationMinutes: 75, lessonNumber: 2 },
    ],
  },
]
