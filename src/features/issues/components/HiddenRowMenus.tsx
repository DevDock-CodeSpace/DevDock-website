import type { Issue } from '../api'
import { useIssueContext, useUpdateIssue } from '../hooks'
import { useRowNav } from '../nav-context'
import { CyclePicker } from './CyclePicker'
import { LabelPicker } from './LabelPicker'

/**
 * The label and cycle menus for a row or card that has no visible trigger for
 * them: mounted only while a shortcut (L, ⇧C) has one open, anchored at `className`.
 */
export function HiddenRowMenus({ issue, className }: { issue: Issue; className: string }) {
  const { workspace, labels, cycles, canManage } = useIssueContext()
  const update = useUpdateIssue()
  const nav = useRowNav(issue.id)
  const anchor = <span aria-hidden className={className} />

  if (nav.openKind === 'label') {
    return (
      <LabelPicker
        workspaceId={workspace.id}
        value={issue.labelIds}
        labels={labels}
        canCreate={canManage}
        align="end"
        onChange={(labelIds) => update.mutate({ issue, labelIds })}
        {...nav.menuFor('label')}
      >
        {anchor}
      </LabelPicker>
    )
  }
  if (nav.openKind === 'cycle') {
    return (
      <CyclePicker
        value={issue.cycle_id}
        cycles={cycles}
        align="end"
        onChange={(cycle_id) => update.mutate({ issue, patch: { cycle_id } })}
        {...nav.menuFor('cycle')}
      >
        {anchor}
      </CyclePicker>
    )
  }
  return null
}
