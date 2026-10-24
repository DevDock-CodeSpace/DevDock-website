// Spots Mermaid code in pasted text: a bare diagram, or one inside a chatbot's reply
// (```mermaid … ``` with sentences around it). Kept apart from the parser so the editor
// can check every paste without loading it. No imports: Deno tests run it as is.

/** The diagram types DevDock turns into shapes. */
export const IMPORTABLE = ['flowchart', 'erDiagram'] as const
export type ImportableType = (typeof IMPORTABLE)[number]

/** Mermaid's other diagram types: recognised only to say they can't be imported. */
const OTHER_TYPES = [
  'sequenceDiagram',
  'classDiagram',
  'classDiagram-v2',
  'stateDiagram',
  'stateDiagram-v2',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'requirementDiagram',
  'C4Context',
  'C4Container',
  'C4Component',
  'C4Dynamic',
  'C4Deployment',
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'packet-beta',
  'architecture-beta',
  'kanban',
  'radar-beta',
]

/** `flowchart TD`, `graph LR`, `flowchart-elk`, `erDiagram`: the whole line, nothing else on it. */
const FLOWCHART_HEADER = /^(?:flowchart|graph|flowchart-elk)(?:\s+(?:TB|TD|BT|LR|RL))?\s*;?\s*$/i
const ER_HEADER = /^erDiagram\s*$/

export type FoundMermaid =
  | { importable: true; type: ImportableType; code: string }
  | { importable: false; type: string; code: string }

/** What kind of diagram a header line starts, if it starts one. */
function headerType(line: string): FoundMermaid['type'] | null {
  const trimmed = line.trim()
  if (FLOWCHART_HEADER.test(trimmed)) return 'flowchart'
  if (ER_HEADER.test(trimmed)) return 'erDiagram'
  const word = trimmed.split(/\s/, 1)[0]
  return OTHER_TYPES.includes(word) ? word : null
}

/** Lines Mermaid allows before the header: blanks, `%%` comments and `%%{init}%%` directives. */
const isPreamble = (line: string) => line.trim() === '' || line.trim().startsWith('%%')

/** Skips a leading `--- … ---` front-matter block (title, config). Returns the index after it. */
function skipFrontMatter(lines: string[], start: number) {
  let i = start
  while (i < lines.length && lines[i].trim() === '') i++
  if (lines[i]?.trim() !== '---') return start
  for (let j = i + 1; j < lines.length; j++) if (lines[j].trim() === '---') return j + 1
  return start
}

/** The first diagram in `lines` from `start`: its header type and the code from the header on. */
function diagramAt(lines: string[], start: number): FoundMermaid | null {
  let i = skipFrontMatter(lines, start)
  while (i < lines.length && isPreamble(lines[i])) i++
  if (i >= lines.length) return null
  const type = headerType(lines[i])
  if (!type) return null
  const code = lines.slice(i).join('\n')
  return (IMPORTABLE as readonly string[]).includes(type)
    ? { importable: true, type: type as ImportableType, code }
    : { importable: false, type, code }
}

/**
 * Mermaid in `text`, or null when there is none. Looks for a fenced block first (```mermaid,
 * or any fence whose content starts with a header), then for a bare diagram, which may come
 * after a sentence or two ("Here's the diagram:"). A header must be a whole line, so ordinary
 * text that merely mentions "graph" is never mistaken for a diagram.
 */
export function findMermaid(text: string): FoundMermaid | null {
  if (text.length > 200_000) return null
  const fences = [...text.matchAll(/(^|\n)[ \t]*(`{3,}|~{3,})[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g)]
  for (const fence of fences) {
    const lang = fence[3].toLowerCase()
    if (lang && lang !== 'mermaid' && lang !== 'mmd') continue
    const found = diagramAt(fence[4].split(/\r?\n/), 0)
    if (found) return found
  }
  // An unclosed ```mermaid fence (a reply cut off, or copied without its end).
  const open = /(^|\n)[ \t]*(`{3,}|~{3,})[ \t]*mermaid[^\n]*\n([\s\S]*)$/i.exec(text)
  if (open) {
    const found = diagramAt(open[3].split(/\r?\n/), 0)
    if (found) return found
  }
  // Bare code, possibly after some sentences: the first line that is a header.
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    // The first line may also start with front matter or `%%` lines; later ones must be the header.
    const found = i === 0 ? diagramAt(lines, 0) : headerType(lines[i]) ? diagramAt(lines, i) : null
    if (!found) continue
    // Drop a fence that closes the code, and anything after it.
    const end = found.code.search(/\n[ \t]*(`{3,}|~{3,})[ \t]*(\n|$)/)
    return end === -1 ? found : { ...found, code: found.code.slice(0, end) }
  }
  return null
}
