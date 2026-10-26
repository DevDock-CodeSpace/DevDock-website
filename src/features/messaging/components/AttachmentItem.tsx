import { FileText, Image as ImageIcon, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { createSignedAttachmentUrl, isImageAttachment } from '../api'
import { formatFileSize } from '../names'

type Props = {
  attachment: { storage_path: string; file_name: string; file_size: number; mime_type: string }
  /** For an image: its signed link, from the conversation's one batch. Shown as a picture. */
  previewUrl?: string
  /** The batch is still on its way: hold the picture's space. */
  previewLoading?: boolean
}

export function AttachmentItem({ attachment, previewUrl, previewLoading = false }: Props) {
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
  const image = isImageAttachment(attachment.mime_type)
  if (image && previewUrl) {
    // A fixed height, so the list doesn't jump when the picture arrives.
    return (
      <a href={previewUrl} target="_blank" rel="noopener noreferrer" title={`${attachment.file_name} · ${formatFileSize(attachment.file_size)}`} className="block overflow-hidden rounded-xl border bg-muted transition-opacity hover:opacity-90">
        <img src={previewUrl} alt={attachment.file_name} loading="lazy" className="h-48 w-auto max-w-72 object-contain" />
      </a>
    )
  }
  if (image && previewLoading) return <div className="h-48 w-64 animate-pulse rounded-xl border bg-muted" aria-label={`Loading ${attachment.file_name}`} />
  const Icon = image ? ImageIcon : FileText
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
