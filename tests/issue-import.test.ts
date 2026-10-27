// Issue import (src/features/issues/import/): reading CSV the way Linear, Notion, Jira and
// spreadsheets write it, guessing columns and values, and ordering parents before sub-issues.
// No browser.
//
//   npm run test:import
import { buildImport, distinctValues, KEEP_NAME, NEW_SPRINT, sprintsInFile, type ValueChoices } from '../src/features/issues/import/build.ts'
import { parseCsv, readTable } from '../src/features/issues/import/csv.ts'
import { detectSource, guessMapping } from '../src/features/issues/import/fields.ts'
import { fileSprint, guessPriority, guessStatus, matchPerson, matchSprint, parseDate, parseEstimate, splitLabels } from '../src/features/issues/import/values.ts'

function assertEquals<T>(actual: T, expected: T, message = '') {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${message}\n  expected ${b}\n  got      ${a}`)
}

const noChoices: ValueChoices = { status: {}, priority: {}, assignee: {}, sprint: {} }

Deno.test('CSV: quotes, doubled quotes, line breaks in cells, CRLF, BOM, blank lines', () => {
  const text = '﻿a,b,c\r\n1,"two, with comma","say ""hi"""\r\n"multi\nline",,x\r\n\r\n'
  assertEquals(parseCsv(text), [['a', 'b', 'c'], ['1', 'two, with comma', 'say "hi"'], ['multi\nline', '', 'x']])
})

Deno.test('CSV: semicolons and tabs are detected from the header', () => {
  assertEquals(parseCsv('Title;Status\nA;Done'), [['Title', 'Status'], ['A', 'Done']])
  assertEquals(parseCsv('Title\tStatus\nA, B\tDone'), [['Title', 'Status'], ['A, B', 'Done']])
  // A comma inside a quoted header doesn't count.
  assertEquals(parseCsv('"Title, short";Status\nA;B'), [['Title, short', 'Status'], ['A', 'B']])
})

Deno.test('CSV: short rows are padded to the header', () => {
  assertEquals(readTable('Title,Status,Labels\nOnly a title\n').rows, [['Only a title', '', '']])
})

Deno.test('sources are recognised from their headers', () => {
  const linear = 'ID,Team,Title,Description,Status,Estimate,Priority,Project,Creator,Assignee,Labels,Cycle Number,Cycle Name,Created,Due Date,Parent issue'
  assertEquals(detectSource(linear.split(',')), 'linear')
  assertEquals(detectSource(['Summary', 'Issue key', 'Issue id', 'Parent', 'Status']), 'jira')
  assertEquals(detectSource(['Name', 'Status', 'Assign', 'Tags']), 'csv')
})

Deno.test('Linear columns are mapped', () => {
  const headers = 'ID,Team,Title,Description,Status,Estimate,Priority,Project,Creator,Assignee,Labels,Cycle Number,Cycle Name,Created,Due Date,Parent issue'.split(',')
  const m = guessMapping(headers)
  const name = (i: number | null) => (i === null ? null : headers[i])
  assertEquals(
    [m.ref, m.title, m.description, m.status, m.estimate, m.priority, m.assignee, m.labels, m.sprint, m.due_date, m.parent].map(name),
    ['ID', 'Title', 'Description', 'Status', 'Estimate', 'Priority', 'Assignee', 'Labels', 'Cycle Number', 'Due Date', 'Parent issue'],
  )
})

Deno.test('Jira columns are mapped, and Parent finds the parent by its Issue id', () => {
  const text = [
    'Summary,Issue key,Issue id,Parent,Status,Priority,Labels,Labels,Sprint,Sprint,Custom field (Story Points)',
    'Epic work,CAP-1,10001,,In Progress,Highest,backend,,CAP Sprint 1,CAP Sprint 2,5',
    'Child task,CAP-2,10002,10001,To Do,Low,ui,bug,,,',
  ].join('\n')
  const table = readTable(text)
  const mapping = guessMapping(table.headers)
  assertEquals(table.headers[mapping.ref!], 'Issue key')
  assertEquals(table.headers[mapping.estimate!], 'Custom field (Story Points)')
  const sprints = distinctValues(table, mapping, 'sprint').map((v) => v.value)
  assertEquals(sprints, ['CAP Sprint 2'], 'the latest sprint of a repeated Sprint column')
  const batch = buildImport(table, mapping, noChoices, [])
  assertEquals(batch.rows.map((r) => [r.ref, r.parent_ref, r.labels, r.estimate]), [
    ['CAP-1', null, ['backend'], 5],
    ['CAP-2', 'CAP-1', ['ui', 'bug'], null],
  ])
})

Deno.test('Notion: Name, people lists and date ranges', () => {
  const table = readTable('Name,Status,Assign,Tags,Due\nWrite intro,Not started,"Jane Doe, Sam Lee","Docs, Writing","November 2, 2026 → November 5, 2026"')
  const mapping = guessMapping(table.headers)
  assertEquals(table.headers[mapping.title!], 'Name')
  assertEquals(table.headers[mapping.assignee!], 'Assign')
  assertEquals(distinctValues(table, mapping, 'assignee'), [{ value: 'Jane Doe', count: 1 }])
  const batch = buildImport(table, mapping, { ...noChoices, assignee: { 'Jane Doe': 'u1' } }, ['docs'])
  assertEquals(batch.rows[0].assignee_id, 'u1')
  assertEquals(batch.rows[0].due_date, '2026-11-02')
  assertEquals(batch.newLabels, ['Writing'])
})

Deno.test('statuses and priorities as the tools name them', () => {
  assertEquals(['Backlog', 'Todo', 'To Do', 'In Progress', 'In Review', 'Done', 'Canceled', 'Duplicate', 'Selected for Development', 'Shrug'].map(guessStatus), [
    'backlog', 'todo', 'todo', 'in_progress', 'in_review', 'done', 'canceled', 'canceled', 'todo', null,
  ])
  assertEquals(['No priority', 'Urgent', 'High', 'Medium', 'Low', 'Highest', 'Lowest', '2', '', 'Whenever'].map(guessPriority), [0, 1, 2, 3, 4, 1, 4, 2, 0, null])
})

Deno.test('dates in export formats; ambiguous ones are left empty', () => {
  assertEquals(
    ['2026-11-02', '2026-11-02T22:00:00.000Z', '2026/11/2', '02/Nov/26 10:00 AM', 'November 2, 2026', 'Nov 2nd, 2026', '2 Nov 2026', '02/11/2026', '2026-02-30', ''].map(parseDate),
    ['2026-11-02', '2026-11-02', '2026-11-02', '2026-11-02', '2026-11-02', '2026-11-02', '2026-11-02', null, null, null],
  )
})

Deno.test('estimates, labels', () => {
  assertEquals(['3', '2.5', '1,5', '500', '-1', 'none'].map(parseEstimate), [3, 3, 2, 100, 0, null])
  assertEquals(splitLabels(' bug, UI ;; backend '), ['bug', 'UI', 'backend'])
  assertEquals(splitLabels('Beacon Compliance Monitoring and Anomaly Detection'), ['Beacon Compliance Monitoring and…'])
})

Deno.test('people: name, email, unique first name', () => {
  const people = [{ id: 'a', name: 'Jane Doe' }, { id: 'b', name: 'Sam Lee' }, { id: 'c', name: 'Sam Roe' }]
  assertEquals(['jane doe', 'jane.doe@example.com', 'Jane', 'Sam', 'sam.lee@x.io', 'Nobody', ''].map((v) => matchPerson(v, people)), ['a', 'a', 'a', null, 'b', null, null])
})

Deno.test('sprints by number or name', () => {
  const sprints = [{ id: 's1', number: 1, name: null }, { id: 's3', number: 3, name: 'Launch' }]
  assertEquals(['1', 'Sprint 3', 'Cycle 1', 'CAP Sprint 3', 'launch', '7', ''].map((v) => matchSprint(v, sprints)), ['s1', 's3', 's1', 's3', 's3', null, null])
})

Deno.test('parents come before sub-issues; a loop loses a link; outside parents pass through', () => {
  const table = readTable(['ID,Title,Parent issue', 'A-3,Grandchild,A-2', 'A-2,Child,A-1', 'A-1,Parent,', 'A-4,Loop one,A-5', 'A-5,Loop two,A-4', 'A-6,Orphan,A-99'].join('\n'))
  const batch = buildImport(table, guessMapping(table.headers), noChoices, [])
  assertEquals(batch.rows.map((r) => `${r.ref}<${r.parent_ref ?? ''}`), ['A-1<', 'A-2<A-1', 'A-3<A-2', 'A-5<', 'A-4<A-5', 'A-6<A-99'])
  assertEquals(batch.outsideParents, 1)
})

Deno.test('rows without a title are left out; repeated ids and titles stay distinct', () => {
  const table = readTable('Title,Status\nSame,Done\n,Done\nSame,Todo')
  const batch = buildImport(table, guessMapping(table.headers), { ...noChoices, status: { Done: 'done', Todo: 'todo' } }, [])
  assertEquals(batch.leftOut, [{ line: 3, reason: 'No title' }])
  assertEquals(batch.rows.map((r) => [r.ref, r.status]), [['title:same', 'done'], ['title:same#2', 'todo']])
})

Deno.test('Linear cycles become sprints: the end is the day before the next cycle starts', () => {
  assertEquals(fileSprint('16', 'Cycle 16', '2026-01-26T06:00:00.000Z', '2026-01-29T06:00:00.000Z'), { ref: '16', number: 16, name: null, starts_on: '2026-01-26', ends_on: '2026-01-28' })
  assertEquals(fileSprint('36', 'Launch week', '2026-10-22T05:00:00.000Z', '2026-11-05T06:00:00.000Z')?.name, 'Launch week')
  assertEquals(fileSprint('x', '', 'soon', 'later'), null)
})

const linear = [
  'ID,Title,Assignee,Labels,Project,Project Milestone,Cycle Number,Cycle Name,Cycle Start,Cycle End',
  'B-1,One,dpurdy@skycopinc.com,"Bug, EC2","Alert channels: email notifications via SNS → SQS → Lambda → SES",Audit Foundation,35,Cycle 35,2026-10-08T05:00:00.000Z,2026-10-22T05:00:00.000Z',
  'B-2,Two,Jane Doe,,,,36,Cycle 36,2026-10-22T05:00:00.000Z,2026-11-05T06:00:00.000Z',
  'B-3,Three,,,,,35,Cycle 35,2026-10-08T05:00:00.000Z,2026-10-22T05:00:00.000Z',
].join('\n')

Deno.test('Linear: unmatched people are kept by name; projects become plans, milestones labels; chosen cycles are created', () => {
  const table = readTable(linear)
  const mapping = guessMapping(table.headers)
  assertEquals([...sprintsInFile(table, mapping).keys()], ['35', '36'])
  const batch = buildImport(table, mapping, { ...noChoices, assignee: { 'dpurdy@skycopinc.com': KEEP_NAME, 'Jane Doe': 'u1' }, sprint: { '35': NEW_SPRINT, '36': 's-existing' } }, ['bug'], ['alert channels: email notifications via sns → sqs → lambda → ses'])
  assertEquals(batch.newPlans, [], 'an existing plan with the same name (ignoring case) is reused')
  assertEquals(batch.rows.map((r) => [r.assignee_id, r.import_assignee, r.cycle_id, r.cycle_ref]), [
    [null, 'dpurdy@skycopinc.com', null, '35'],
    ['u1', null, 's-existing', null],
    [null, null, null, '35'],
  ])
  assertEquals(batch.rows[0].labels, ['Bug', 'EC2', 'Audit Foundation'])
  assertEquals(batch.newLabels, ['EC2', 'Audit Foundation'])
  assertEquals(batch.rows.map((r) => r.plan_ref), ['Alert channels: email notifications via SNS → SQS → Lambda → SES', null, null])
  assertEquals(batch.plans, [{ ref: 'Alert channels: email notifications via SNS → SQS → Lambda → SES', name: 'Alert channels: email notifications via SNS → SQS → Lambda → SES' }])
  assertEquals(batch.newSprints.map((s) => [s.ref, s.starts_on, s.ends_on]), [['35', '2026-10-08', '2026-10-21']])
  assertEquals(batch.keptPeople, ['dpurdy@skycopinc.com'])
})
