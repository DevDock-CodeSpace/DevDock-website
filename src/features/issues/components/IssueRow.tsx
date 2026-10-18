import { useCurrentTeam } from '@/features/teams/hooks'
import { issuePath } from '@/features/teams/nav'
import type { Issue } from '../api'
import { useIssueContext, useUpdateIssue } from '../hooks'
import { HiddenRowMenus } from './HiddenRowMenus'
import { IssueRowView } from './IssueRowView'

/** A row in a project's list: `IssueRowView` fed by the project's issue context. */
export function IssueRow({ issue, subIssues }: { issue: Issue; subIssues?: { done: number; total: number } }) {
  const { team } = useCurrentTeam()
  const { workspace, members, labels, cycles, repos, userId } = useIssueContext()
  const update = useUpdateIssue()

  return (
    <IssueRowView
      issue={issue}
      subIssues={subIssues}
      source={{
        href: issuePath(team.slug, workspace.id, issue.number),
        workspace,
        members,
        labels,
        cycles,
        repos,
        userId,
        update: (patch) => update.mutate({ issue, patch }),
      }}
    >
      <HiddenRowMenus issue={issue} className="absolute top-full right-24" />
    </IssueRowView>
  )
}
