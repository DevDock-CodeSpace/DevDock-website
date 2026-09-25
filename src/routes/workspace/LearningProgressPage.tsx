import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PersonAvatar } from '@/components/PersonRow'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { allProgressQuery } from '@/features/learning/api'
import { useLearning } from '@/features/learning/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { learningPath } from '@/features/teams/nav'
import { workspaceMembersQuery } from '@/features/workspaces/api'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Class progress (workspace managers): one row per member with lessons done
 * per module, overall %, and when they last finished a lesson. RLS only
 * returns everyone's rows to managers.
 */
export function LearningProgressPage() {
  const { team } = useCurrentTeam()
  const { workspace, outline, ordered, canManage } = useLearning()
  const members = useSuspenseQuery(workspaceMembersQuery(workspace.id)).data
  const progress = useSuspenseQuery(allProgressQuery(workspace.id)).data
  const [now] = useState(Date.now)

  if (!canManage) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Only the workspace lead and group owners/admins can see the class’s progress.
      </p>
    )
  }

  const lessonIds = new Set(ordered.map((l) => l.id))
  // Students first (by progress), then leads.
  const rows = members
    .map((m) => {
      const mine = progress.filter((p) => p.user_id === m.user_id && lessonIds.has(p.lesson_id))
      const done = new Set(mine.map((p) => p.lesson_id))
      const last = mine.map((p) => p.completed_at).sort().at(-1)
      return { member: m, done, last, percent: ordered.length ? Math.round((done.size / ordered.length) * 100) : 0 }
    })
    .sort((a, b) => Number(a.member.role === 'lead') - Number(b.member.role === 'lead') || b.percent - a.percent)

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <Link
          to={learningPath(team.slug, workspace.id)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Learning
        </Link>
        <h2 className="text-sm font-semibold">Class progress</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {members.length} {members.length === 1 ? 'person' : 'people'} · {ordered.length} lessons
        </span>
      </div>

      {ordered.length === 0 ? (
        <p className="border-y py-10 text-center text-sm text-muted-foreground">Add lessons to track progress.</p>
      ) : (
        <div className="overflow-x-auto border-y">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                <th className="px-3 py-2 text-left font-normal">Person</th>
                {outline.map((m, i) => (
                  <th key={m.id} className="px-2 py-2 text-center font-normal">
                    <Tooltip>
                      <TooltipTrigger className="cursor-default">M{i + 1}</TooltipTrigger>
                      <TooltipContent>{m.title}</TooltipContent>
                    </Tooltip>
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-normal">Overall</th>
                <th className="px-3 py-2 text-right font-normal">Last done</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ member, done, last, percent }) => (
                <tr key={member.user_id} className="hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <PersonAvatar profile={member.profile} className="size-6" />
                      <span className="truncate font-medium">{member.profile?.display_name ?? 'Unnamed member'}</span>
                      {member.role === 'lead' && <span className="text-xs text-brand">Lead</span>}
                    </span>
                  </td>
                  {outline.map((m) => {
                    const total = m.lessons.length
                    const count = m.lessons.filter((l) => done.has(l.id)).length
                    return (
                      <td key={m.id} className="px-2 py-2 text-center">
                        <span
                          className={cn(
                            'inline-block min-w-10 rounded-sm px-1.5 py-0.5 font-mono text-xs',
                            total > 0 && count === total
                              ? 'bg-brand/15 text-brand'
                              : count > 0
                                ? 'bg-muted text-foreground'
                                : 'text-muted-foreground',
                          )}
                        >
                          {total === 0 ? '·' : `${count}/${total}`}
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full bg-brand" style={{ width: `${percent}%` }} />
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{percent}%</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {last ? timeAgo(last, now) : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
