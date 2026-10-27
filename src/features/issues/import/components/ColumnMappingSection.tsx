import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CsvTable } from '../csv'
import { FIELDS, type ColumnMapping, type ImportField } from '../fields'

const NONE = 'none'

/** A sample of what a column holds: its first filled cell, on one line. */
function sample(table: CsvTable, column: number | null) {
  if (column === null) return ''
  const value = table.rows.find((r) => r[column]?.trim())?.[column] ?? ''
  const line = value.trim().replace(/\s+/g, ' ')
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}

/** Which column each DevDock field reads, with an example from the file. */
export function ColumnMappingSection({
  table,
  mapping,
  onChange,
}: {
  table: CsvTable
  mapping: ColumnMapping
  onChange: (field: ImportField, column: number | null) => void
}) {
  return (
    <section aria-labelledby="import-columns">
      <h2 id="import-columns" className="text-sm font-semibold">Columns</h2>
      <p className="mt-1 text-sm text-muted-foreground">Guessed from the file’s headers. Change any that are wrong.</p>
      <div className="mt-3 divide-y border-y">
        {FIELDS.map(({ field, label, hint }) => (
          <div key={field} className="grid items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[9rem_14rem_minmax(0,1fr)]">
            <div>
              <div className="text-sm font-medium">{label}</div>
            </div>
            <Select
              value={mapping[field] === null ? NONE : String(mapping[field])}
              onValueChange={(v) => {
                // Radix reports '' when its options change under it.
                if (v === '') return
                onChange(field, v === NONE ? null : Number(v))
              }}
            >
              <SelectTrigger aria-label={`Column for ${label}`} className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-xs text-muted-foreground">
                  {field === 'title' ? 'Choose a column' : 'Don’t import'}
                </SelectItem>
                {table.headers.map((header, i) => (
                  <SelectItem key={i} value={String(i)} className="text-xs">
                    {header || `Column ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="min-w-0 text-xs text-muted-foreground">
              {mapping[field] === null ? hint : <span className="block truncate font-mono" title={sample(table, mapping[field])}>{sample(table, mapping[field]) || 'Empty in every row'}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
