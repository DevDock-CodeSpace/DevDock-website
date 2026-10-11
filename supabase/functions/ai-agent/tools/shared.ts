// Helpers every tool file uses: results, database errors, and plain text ↔ TipTap.

import type { AiErrorCode, AiToolResult } from '../agent/types.ts'

export const ok = <T>(data: T): AiToolResult<T> => ({ success: true, data })

export const fail = (code: AiErrorCode, message: string, details?: unknown): AiToolResult<never> =>
  details === undefined ? { success: false, code, message } : { success: false, code, message, details }

type DbError = { code?: string; message?: string }

// The same Postgres codes src/lib/errors.ts turns into messages for the UI.
const byCode: Record<string, { code: AiErrorCode; message: string }> = {
  '42501': { code: 'PERMISSION_DENIED', message: 'You don’t have permission to do that.' },
  '23503': { code: 'NOT_ALLOWED', message: 'That person isn’t a member of this group.' },
  '23505': { code: 'NOT_ALLOWED', message: 'That already exists.' },
  '23514': { code: 'NOT_ALLOWED', message: 'That value isn’t allowed.' },
  '22023': { code: 'INVALID_ARGUMENTS', message: 'That value isn’t valid.' },
}

/**
 * A refused or failed query as a tool result. The database's own text is
 * logged with its code and never returned: the model would repeat it.
 */
export function dbFailure(action: string, error: DbError, overrides: Record<string, { code: AiErrorCode; message: string }> = {}): AiToolResult<never> {
  console.error(`[ai-agent] failed to ${action}`, error.code ?? 'unknown')
  const known = error.code ? (overrides[error.code] ?? byCode[error.code]) : undefined
  return known ? fail(known.code, known.message) : fail('INTERNAL', `Couldn’t ${action}.`)
}

/** RLS turns a forbidden UPDATE into "0 rows", not an error (as requireAffected does in the app). */
export const DENIED = fail('PERMISSION_DENIED', 'You don’t have permission to do that, or it no longer exists.')

/** Plain text as the TipTap document the editors store: one paragraph per line. */
export function textToDoc(text: string) {
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return {
    type: 'doc',
    content: (paragraphs.length > 0 ? paragraphs : ['']).map((line) =>
      line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
    ),
  }
}

/** The text of a TipTap document, cut to `max` characters. Tolerates anything stored. */
export function docToText(doc: unknown, max: number): string {
  const parts: string[] = []
  let length = 0
  const walk = (node: unknown, depth: number) => {
    if (length >= max || depth > 30 || typeof node !== 'object' || node === null) return
    const { text, content } = node as { text?: unknown; content?: unknown }
    if (typeof text === 'string') {
      parts.push(text)
      length += text.length
    }
    if (Array.isArray(content)) {
      for (const child of content) walk(child, depth + 1)
      // Block boundary.
      if (depth <= 2) parts.push('\n')
    }
  }
  walk(doc, 0)
  const text = parts.join('').replace(/\n{2,}/g, '\n').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Escapes the wildcards of a LIKE pattern, so a search for "50%" means that. */
export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/** Case- and accent-insensitive comparison key. */
export const fold = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/**
 * How well `candidate` answers a search for `query`: 3 exact, 2 a word starts
 * with it, 1 it appears somewhere, 0 no match.
 */
export function matchScore(candidate: string, query: string): 0 | 1 | 2 | 3 {
  const c = fold(candidate)
  const q = fold(query)
  if (!q || !c) return 0
  if (c === q) return 3
  if (c.split(/\s+/).some((word) => word.startsWith(q)) || c.startsWith(q)) return 2
  return c.includes(q) ? 1 : 0
}

/** The best-scoring candidates only: an exact match hides partial ones. */
export function bestMatches<T>(items: T[], query: string, text: (item: T) => string): T[] {
  const scored = items.map((item) => ({ item, score: matchScore(text(item), query) })).filter((s) => s.score > 0)
  const top = Math.max(0, ...scored.map((s) => s.score))
  return scored.filter((s) => s.score === top).map((s) => s.item)
}
