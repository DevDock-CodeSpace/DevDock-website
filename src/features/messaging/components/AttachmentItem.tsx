import { FileText, Image as ImageIcon, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { createSignedAttachmentUrl } from '../api'
import { formatFileSize } from '../names'

export function AttachmentItem({ attachment }: { attachment: { storage_path: string; file_name: string; file_size: number; mime_type: string } }) {
  const [loading, setLoading] = useState(false)
  const open = async () => {
    setLoading(true)
    try {
      const url = await createSignedAttachmentUrl(attachment.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }
  const Icon = attachment.mime_type.startsWith('image/') ? ImageIcon : FileText
  return (
    <button type="button" onClick={() => void open()} disabled={loading} className="flex max-w-72 items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted">
      {loading ? <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" /> : <Icon className="size-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{attachment.file_name}</span>
        <span className="block font-mono text-[10px] text-muted-foreground">{formatFileSize(attachment.file_size)}</span>
      </span>
    </button>
  )
}
