import { FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SOURCES, type ImportSource } from '../fields'

/** Big enough for 1000 issues with long descriptions; anything larger is split anyway. */
const MAX_BYTES = 5 * 1024 * 1024

/** Where the file comes from (only changes the how-to and how descriptions are read), then the file. */
export function ImportFilePicker({
  source,
  onSourceChange,
  onFile,
}: {
  source: ImportSource
  onSourceChange: (source: ImportSource) => void
  onFile: (name: string, text: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const how = SOURCES.find((s) => s.source === source)?.how

  const read = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) {
      toast.error('That file is over 5 MB. Export fewer issues at a time.')
      return
    }
    if (!/\.(csv|tsv|txt)$/i.test(file.name) && !file.type.includes('csv') && !file.type.startsWith('text/')) {
      toast.error('Pick a .csv file. Exports from Linear, Notion and Jira are CSV files.')
      return
    }
    onFile(file.name, await file.text())
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Import from" className="flex flex-wrap gap-1.5">
        {SOURCES.map((s) => (
          <button
            key={s.source}
            type="button"
            role="radio"
            aria-checked={s.source === source}
            onClick={() => onSourceChange(s.source)}
            className={cn(
              'h-7 rounded-full border px-3 text-xs transition-colors',
              s.source === source ? 'border-foreground/20 bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{how}</p>
      <div
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes('Files')) return
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void read(e.dataTransfer.files[0])
        }}
        className={cn(
          'flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center transition-colors',
          over && 'border-brand bg-brand/5',
        )}
      >
        <FileUp className="size-6 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-medium">Drop the CSV file here</p>
          <p className="mt-1 text-xs text-muted-foreground">Up to 1000 issues and 5 MB. Nothing is saved until you press Import.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
          Choose a file
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="hidden"
          onChange={(e) => {
            void read(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
