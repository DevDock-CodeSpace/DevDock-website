// CSV → rows of cells (RFC 4180, as Linear, Notion, Jira and spreadsheets write it): quoted
// cells with "" for a quote, line breaks inside quotes, CRLF or LF, an Excel byte-order mark,
// and comma, semicolon (European Excel) or tab separators, picked from the header line.
// No imports: Deno tests run it as is (npm run test:import).

export type CsvTable = { headers: string[]; rows: string[][] }

/** The separator the header line uses most, outside quotes. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const char of text) {
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === '\n' || char === '\r')) break
    else if (!quoted && char in counts) counts[char as keyof typeof counts]++
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';'
  if (counts['\t'] > counts[',']) return '\t'
  return ','
}

export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char !== '"') cell += char
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
    } else if (char === '"' && cell === '') quoted = true
    else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // Blank lines (often the last one) aren't rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** The first row is the header; short rows are padded so every row has a cell per column. */
export function readTable(text: string): CsvTable {
  const [first = [], ...rest] = parseCsv(text)
  const headers = first.map((h) => h.trim())
  return { headers, rows: rest.map((r) => headers.map((_, i) => r[i] ?? '')) }
}
