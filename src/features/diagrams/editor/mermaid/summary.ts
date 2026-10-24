// How an import is described to people: in the dialog and in the toast after a paste.

import type { Skipped } from './parse.ts'

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Joins with commas and a final "and": "3 shapes, 1 group and 2 connectors". */
function list(parts: string[]) {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** "10 shapes, 4 groups and 10 connectors" (flowchart) or "6 tables and 6 links" (ER). */
export function importSummary(kind: 'flowchart' | 'er', counts: { shapes: number; groups: number; connectors: number }) {
  if (kind === 'er') return list([count(counts.shapes, 'table', 'tables'), count(counts.connectors, 'link', 'links')])
  return list(
    [
      count(counts.shapes, 'shape', 'shapes'),
      counts.groups ? count(counts.groups, 'group', 'groups') : '',
      count(counts.connectors, 'connector', 'connectors'),
    ].filter(Boolean),
  )
}

const quote = (text: string) => `“${text.length > 40 ? `${text.slice(0, 39)}…` : text}”`

/**
 * `2 lines weren't understood and were left out: “…”, “…”.` Quotes the text rather than line
 * numbers: after a paste the code isn't on screen, and a chatbot reply's lines don't match it.
 */
export function skippedSummary(skipped: Skipped[]) {
  const n = new Set(skipped.map((s) => s.line)).size
  const which = skipped.slice(0, 3).map((s) => quote(s.text)).join(', ') + (skipped.length > 3 ? ', …' : '')
  return n === 1 ? `1 line wasn't understood and was left out: ${which}.` : `${n} lines weren't understood and were left out: ${which}.`
}
