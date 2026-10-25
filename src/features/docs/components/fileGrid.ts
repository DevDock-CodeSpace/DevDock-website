// The one row layout of Files (the folder browser and the Recent list), so every list on the page
// lines up: icon/checkbox | name | owner or place | updated | actions. Owner and the actions column
// collapse on phones.

export const FILE_GRID =
  'grid grid-cols-[1.75rem_minmax(0,1fr)_5.5rem] items-center gap-x-3 px-3 md:grid-cols-[1.75rem_minmax(0,1fr)_12rem_6.5rem_1.75rem]'

/** The quiet column header above a list. */
export const FILE_HEADER = `${FILE_GRID} h-8 border-b font-mono text-[11px] uppercase tracking-wide text-muted-foreground`

/** A row: the same height whatever it holds. */
export const FILE_ROW = `${FILE_GRID} group relative h-12 border-b transition-colors last:border-b-0 hover:bg-muted/40`
