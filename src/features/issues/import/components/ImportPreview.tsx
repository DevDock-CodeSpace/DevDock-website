import { CornerDownRight } from 'lucide-react'
import type { WorkspaceMember } from '@/features/workspaces/api'
import { PriorityIcon } from '../../components/PriorityIcon'
import { StatusIcon } from '../../components/StatusIcon'
import { statusLabel } from '../../meta'
import type { ImportBatch } from '../build'

const SHOWN = 50

/** What will be created, exactly as it will be sent (the first 50 rows), and what is left out. */
export function ImportPreview({ batch, members }: { batch: ImportBatch; members: WorkspaceMember[] }) {
  const subIssues = batch.rows.filter((r) => r.parent_ref).length
  const person = (id: string | null) => members.find((m) => m.user_id === id)

  return (
    <section aria-labelledby="import-preview">
      <h2 id="import-preview" className="text-sm font-semibold">Preview</h2>
      <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
        <li>
          <span className="font-mono text-foreground">{batch.rows.length}</span> {batch.rows.length === 1 ? 'issue' : 'issues'}
          {subIssues > 0 && <>, <span className="font-mono">{subIssues}</span> of them sub-issues</>}. Issues imported from this file before are skipped.
        </li>
        {batch.newLabels.length > 0 && (
          <li>
            New labels: {batch.newLabels.slice(0, 12).join(', ')}
            {batch.newLabels.length > 12 && ` and ${batch.newLabels.length - 12} more`}.
          </li>
        )}
        {batch.plans.length > 0 && (
          <li>
            Plans: <span className="font-mono">{batch.plans.length}</span>
            {batch.newPlans.length > 0 && (
              <>
                , new: {batch.newPlans.slice(0, 8).join(', ')}
                {batch.newPlans.length > 8 && ` and ${batch.newPlans.length - 8} more`}
              </>
            )}
            {batch.newPlans.length < batch.plans.length && <>; the others go into plans that already exist</>}. Their issues stay in this project.
          </li>
        )}
        {batch.newSprints.length > 0 && (
          <li>
            New sprints: <span className="font-mono">{batch.newSprints.length}</span>, from {batch.newSprints[0].starts_on} to {batch.newSprints.at(-1)?.ends_on}. A sprint whose dates overlap one already in this project isn’t created.
          </li>
        )}
        {batch.keptPeople.length > 0 && (
          <li>
            Not in this project yet, kept by name until you match them: {batch.keptPeople.slice(0, 6).join(', ')}
            {batch.keptPeople.length > 6 && ` and ${batch.keptPeople.length - 6} more`}.
          </li>
        )}
        {batch.outsideParents > 0 && (
          <li>
            <span className="font-mono">{batch.outsideParents}</span> {batch.outsideParents === 1 ? 'sub-issue’s parent isn’t' : 'sub-issues’ parents aren’t'} in this file: they join a parent imported earlier if there is one, otherwise they come in on their own.
          </li>
        )}
        {batch.leftOut.length > 0 && (
          <li className="text-amber-600 dark:text-amber-400">
            Left out: {batch.leftOut.length === 1 ? 'line' : 'lines'} {batch.leftOut.slice(0, 10).map((l) => l.line).join(', ')}
            {batch.leftOut.length > 10 && ` and ${batch.leftOut.length - 10} more`} (no title).
          </li>
        )}
      </ul>
      {batch.rows.length > 0 && (
        <div className="mt-3 overflow-x-auto border-y">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="w-1/2 py-1.5 pr-3 font-normal">Title</th>
                <th className="py-1.5 pr-3 font-normal">Status</th>
                <th className="py-1.5 pr-3 font-normal">Assignee</th>
                <th className="py-1.5 pr-3 font-normal">Labels</th>
                <th className="py-1.5 font-normal">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {batch.rows.slice(0, SHOWN).map((row) => {
                const assignee = person(row.assignee_id)
                return (
                  <tr key={row.ref}>
                    <td className="max-w-0 py-1.5 pr-3">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {row.parent_ref && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="Sub-issue" />}
                        <PriorityIcon priority={row.priority} className="text-muted-foreground" />
                        <span className="truncate" title={row.title}>{row.title}</span>
                      </div>
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs"><StatusIcon status={row.status} /> {statusLabel[row.status]}</span>
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {assignee ? (
                        <span className="text-xs">{assignee.profile?.display_name ?? 'Unnamed'}</span>
                      ) : row.import_assignee ? (
                        <span className="text-xs text-muted-foreground italic" title="Kept from the file until you match someone to it">{row.import_assignee}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-48 truncate py-1.5 pr-3 text-xs text-muted-foreground" title={row.labels.join(', ')}>{row.labels.join(', ') || '—'}</td>
                    <td className="py-1.5 font-mono text-xs whitespace-nowrap text-muted-foreground">{row.due_date ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {batch.rows.length > SHOWN && (
            <p className="border-t py-1.5 text-xs text-muted-foreground">And <span className="font-mono">{batch.rows.length - SHOWN}</span> more.</p>
          )}
        </div>
      )}
    </section>
  )
}
