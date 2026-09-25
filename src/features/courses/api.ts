import { queryOptions } from '@tanstack/react-query'
import type { PersonProfile } from '@/features/workspaces/api'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Database, Tables, TablesInsert } from '@/types/database.types'

export type CourseRole = Database['public']['Enums']['course_role']
export type Course = Pick<
  Tables<'courses'>,
  'id' | 'workspace_id' | 'title' | 'description' | 'created_at' | 'updated_at'
>
export type CourseSummary = Pick<Tables<'courses'>, 'id' | 'title' | 'description'> & { memberCount: number }
export type CourseMember = { user_id: string; role: CourseRole; joined_at: string; profile: PersonProfile }

// ---------------------------------------------------------------- queries

/** Courses visible to the caller: all of them for owners/admins, assigned ones otherwise (RLS). */
export const workspaceCoursesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['courses', 'workspace', workspaceId],
    queryFn: async (): Promise<CourseSummary[]> => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, description, course_members(count)')
        .eq('workspace_id', workspaceId)
        .order('title')
      if (error) throw toDataError('load courses', error)
      return data.map(({ course_members, ...course }) => ({
        ...course,
        memberCount: course_members[0]?.count ?? 0,
      }))
    },
  })

/** The caller's role in each course of a workspace they're assigned to. */
export const myCourseRolesQuery = (workspaceId: string, userId: string) =>
  queryOptions({
    queryKey: ['courses', 'workspace', workspaceId, 'my-roles', userId],
    queryFn: async (): Promise<Record<string, CourseRole>> => {
      const { data, error } = await supabase
        .from('course_members')
        .select('course_id, role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
      if (error) throw toDataError('load your course roles', error)
      return Object.fromEntries(data.map((row) => [row.course_id, row.role]))
    },
  })

/** null when the course doesn't exist or the caller can't see it. */
export const courseQuery = (courseId: string) =>
  queryOptions({
    queryKey: ['courses', courseId],
    queryFn: async (): Promise<Course | null> => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, workspace_id, title, description, created_at, updated_at')
        .eq('id', courseId)
        .maybeSingle()
      if (error) throw toDataError('load the course', error)
      return data
    },
  })

export const courseMembersQuery = (courseId: string) =>
  queryOptions({
    queryKey: ['courses', courseId, 'members'],
    queryFn: async (): Promise<CourseMember[]> => {
      const { data, error } = await supabase
        .from('course_members')
        .select('user_id, role, joined_at, profile:profiles(display_name, avatar_url)')
        .eq('course_id', courseId)
        .order('joined_at')
      if (error) throw toDataError('load course members', error)
      return data
    },
  })

// -------------------------------------------------------------- mutations

export async function createCourse(
  workspaceId: string,
  input: { title: string; description: string },
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('courses')
    .insert({
      workspace_id: workspaceId,
      title: input.title.trim(),
      description: input.description.trim() || null,
    })
    .select('id')
    .single()
  if (error) throw toDataError('create the course', error)
  return data
}

export async function updateCourse(courseId: string, input: { title: string; description: string }) {
  const { data, error } = await supabase
    .from('courses')
    .update({ title: input.title.trim(), description: input.description.trim() || null })
    .eq('id', courseId)
    .select('id')
  if (error) throw toDataError('save the course', error)
  requireAffected(data, 'update course')
}

export async function deleteCourse(courseId: string) {
  const { data, error } = await supabase.from('courses').delete().eq('id', courseId).select('id')
  if (error) throw toDataError('delete the course', error)
  requireAffected(data, 'delete course')
}

export async function addCourseMember(courseId: string, userId: string, role: CourseRole) {
  // workspace_id is NOT NULL but always set by a DB trigger from the course (clients
  // have no INSERT privilege on it). Generated types can't see triggers, so omit it here.
  const row: Omit<TablesInsert<'course_members'>, 'workspace_id'> = { course_id: courseId, user_id: userId, role }
  const { error } = await supabase.from('course_members').insert(row as TablesInsert<'course_members'>)
  if (error) {
    throw toDataError('add the member', error, { '23505': 'They’re already in this course.' })
  }
}

export async function setCourseRole(courseId: string, userId: string, role: CourseRole) {
  const { data, error } = await supabase
    .from('course_members')
    .update({ role })
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw toDataError('change the role', error)
  requireAffected(data, 'change course role')
}

/** Remove someone, or leave (userId = yourself). */
export async function removeCourseMember(courseId: string, userId: string) {
  const { data, error } = await supabase
    .from('course_members')
    .delete()
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw toDataError('remove the member', error)
  requireAffected(data, 'remove course member')
}
