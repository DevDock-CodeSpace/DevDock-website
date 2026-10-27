import { ArrowLeft, FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useIssueContext } from '@/features/issues/hooks'
import { buildImport, distinctValues, KEEP_NAME, NEW_SPRINT, sprintsInFile, type ChoiceField, type ValueChoices } from '@/features/issues/import/build'
import { ColumnMappingSection } from '@/features/issues/import/components/ColumnMappingSection'
import { ImportFilePicker } from '@/features/issues/import/components/ImportFilePicker'
import { ImportPreview } from '@/features/issues/import/components/ImportPreview'
import { ValueChoicesSection, type ChoiceGroup } from '@/features/issues/import/components/ValueChoicesSection'
import { readTable, type CsvTable } from '@/features/issues/import/csv'
import { detectSource, guessMapping, SOURCES, type ColumnMapping, type ImportSource } from '@/features/issues/import/fields'
import { importPeopleQuery } from '@/features/issues/import/api'
import { useImportIssues } from '@/features/issues/import/hooks'
import { descriptionDoc } from '@/features/issues/import/markdown'
import { guessPriority, guessStatus, matchPerson, matchSprint } from '@/features/issues/import/values'
import { useCurrentTeam } from '@/features/teams/hooks'
import { hubSettingsPath, issuesPath, teamIssuesPath, workspacePath } from '@/features/teams/nav'
import { errorMessage } from '@/lib/errors'

const MAX_ISSUES = 1000
const CHOICE_FIELDS: ChoiceField[] = ['status', 'priority', 'assignee', 'sprint']
const noOverrides = (): ValueChoices => ({ status: {}, priority: {}, assignee: {}, sprint: {} })
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

type LoadedFile = { name: string; table: CsvTable }

/**
 * …/w/:id/issues/import: a CSV file (or Linear, Notion or Jira's CSV export) becomes issues in this
 * project. Everything is worked out in the browser from the file and the data the Issues loader
 * already has (people, labels, sprints, issues), so the page makes no request until Import, which is one.
 * Reached from Settings → Import, which also lists who the people named in imported files are.
 */
export function IssueImportPage() {
  const { team } = useCurrentTeam()
  const { workspace, members, labels, cycles, plans, canManage } = useIssueContext()
  const navigate = useNavigate()
  // Opened from the Issues hub's ⚙ Issue settings (?from=hub) or the project's Settings → Import: back to where it came from.
  const [params] = useSearchParams()
  const fromHub = params.get('from') === 'hub'
  const back = fromHub ? teamIssuesPath(team.slug) : issuesPath(team.slug, workspace.id)
  const returnTo = fromHub ? { to: hubSettingsPath(team.slug), label: 'Issue settings' } : { to: `${workspacePath(team.slug, workspace.id)}/settings`, label: 'Settings' }
  const importing = useImportIssues(workspace.id)
  // Names earlier imports were matched to (Settings → Import): the same name means the same person.
  const mapped = useSuspenseQuery(importPeopleQuery(workspace.id)).data

  const [source, setSource] = useState<ImportSource>('csv')
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [overrides, setOverrides] = useState<ValueChoices>(noOverrides)

  const people = useMemo(() => members.map((m) => ({ id: m.user_id, name: m.profile?.display_name ?? '' })), [members])
  // Only mappings to someone still in the project count.
  const known = useMemo(
    () => new Map(mapped.filter((p) => p.user_id && members.some((m) => m.user_id === p.user_id)).map((p) => [p.name, p.user_id as string])),
    [mapped, members],
  )
  const fileSprints = useMemo(() => (file && mapping ? sprintsInFile(file.table, mapping) : new Map()), [file, mapping])

  // The values the file uses, what we'd guess for each, and what the person changed. Anything not
  // matched keeps what the file says: a person's name until someone is matched, a sprint created
  // from the file's dates.
  const { groups, choices } = useMemo(() => {
    const choices = noOverrides()
    const groups: ChoiceGroup[] = []
    if (!file || !mapping) return { groups, choices }
    for (const field of CHOICE_FIELDS) {
      const values = distinctValues(file.table, mapping, field).map(({ value, count }) => {
        const guess =
          field === 'status' ? guessStatus(value)
          : field === 'priority' ? guessPriority(value)
          : field === 'assignee' ? (known.get(value) ?? matchPerson(value, people))
          : matchSprint(value, cycles)
        const fallback =
          field === 'status' ? 'todo'
          : field === 'priority' ? 0
          : field === 'assignee' ? (value ? KEEP_NAME : null)
          : fileSprints.has(value) ? NEW_SPRINT : null
        const chosen = (overrides[field] as Record<string, unknown>)[value]
        ;(choices[field] as Record<string, unknown>)[value] = chosen !== undefined ? chosen : (guess ?? fallback)
        return { value, count, matched: guess !== null }
      })
      groups.push({ field, values })
    }
    return { groups, choices }
  }, [file, mapping, overrides, people, known, cycles, fileSprints])

  const batch = useMemo(
    () => (file && mapping ? buildImport(file.table, mapping, choices, labels.map((l) => l.name), plans.map((p) => p.name)) : null),
    [file, mapping, choices, labels, plans],
  )

  if (!canManage) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-medium">Only project leads and group owners or admins can import issues.</p>
        <Button asChild size="sm" variant="outline" className="mt-4"><Link to={back}>Back to issues</Link></Button>
      </div>
    )
  }

  const load = (name: string, text: string) => {
    const table = readTable(text)
    if (table.headers.length === 0 || table.rows.length === 0) {
      toast.error('That file has no rows under its header.')
      return
    }
    const detected = detectSource(table.headers)
    if (detected !== 'csv') setSource(detected)
    setFile({ name, table })
    setMapping(guessMapping(table.headers))
    setOverrides(noOverrides())
  }

  const run = async () => {
    if (!batch) return
    try {
      const issues = batch.rows.map((row) => ({ ...row, description: row.description ? descriptionDoc(row.description, source) : null }))
      // Every name the file uses for an assignee, with who it was matched to (or kept by name), so
      // Settings shows the mapping and later imports reuse it. "No assignee" isn't a mapping.
      const filePeople = Object.entries(choices.assignee)
        .filter(([name, choice]) => name && choice !== null)
        .map(([name, choice]) => ({ name, user_id: choice === KEEP_NAME ? null : choice }))
      const result = await importing.mutateAsync({ source, issues, sprints: batch.newSprints, people: filePeople, plans: batch.plans })
      if (result.created === 0) {
        toast.info(`Nothing new: ${result.skipped === 1 ? 'this issue was' : `all ${result.skipped} issues were`} imported before.`)
      } else {
        const parts = [`Imported ${plural(result.created, 'issue', 'issues')}`]
        if (result.skipped) parts.push(`${result.skipped} imported before, skipped`)
        if (result.labels_created) parts.push(plural(result.labels_created, 'new label', 'new labels'))
        if (result.sprints_created) parts.push(plural(result.sprints_created, 'new sprint', 'new sprints'))
        if (result.plans_created) parts.push(plural(result.plans_created, 'new plan', 'new plans'))
        toast.success(parts.join(' · '))
      }
      if (result.sprints_skipped) {
        toast.warning(`${plural(result.sprints_skipped, 'sprint wasn’t', 'sprints weren’t')} created: their dates overlap a sprint already in this project. Their issues came in without a sprint.`)
      }
      navigate(back)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const tooMany = (batch?.rows.length ?? 0) > MAX_ISSUES
  const sourceLabel = SOURCES.find((s) => s.source === source)?.label

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <Link to={returnTo.to} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> {returnTo.label}
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Import issues</h1>
        </div>
        {file && batch && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setFile(null)} disabled={importing.isPending}>Choose another file</Button>
            <Button size="sm" onClick={run} disabled={importing.isPending || batch.rows.length === 0 || tooMany || mapping?.title === null}>
              {importing.isPending && <LoaderCircle className="animate-spin" />}
              Import {plural(batch.rows.length, 'issue', 'issues')}
            </Button>
          </div>
        )}
      </div>

      {!file || !mapping || !batch ? (
        <ImportFilePicker source={source} onSourceChange={setSource} onFile={load} />
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-medium">{file.name}</span>
            <span className="text-muted-foreground">
              · <span className="font-mono">{file.table.rows.length}</span> rows · {sourceLabel} into {workspace.title}
            </span>
          </p>
          {tooMany && (
            <p role="alert" className="rounded-md border border-dashed px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
              This file has {batch.rows.length} issues. Import at most {MAX_ISSUES} at a time: split the file, and import each part.
            </p>
          )}
          {mapping.title === null && (
            <p role="alert" className="rounded-md border border-dashed px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
              Choose the column that holds each issue’s title.
            </p>
          )}
          <ColumnMappingSection table={file.table} mapping={mapping} onChange={(field, column) => setMapping({ ...mapping, [field]: column })} />
          <ValueChoicesSection
            groups={groups}
            choices={choices}
            members={members}
            cycles={cycles}
            fileSprints={fileSprints}
            onChange={(field, value, choice) => setOverrides((o) => ({ ...o, [field]: { ...o[field], [value]: choice } }))}
          />
          <ImportPreview batch={batch} members={members} />
        </>
      )}
    </div>
  )
}
