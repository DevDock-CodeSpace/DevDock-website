import { toast } from 'sonner'

/**
 * Puts text on the clipboard. `text` may still be on its way (a request): the write
 * starts inside the click either way, which Safari requires.
 */
async function writeClipboard(text: string | Promise<string>): Promise<boolean> {
  if (typeof text !== 'string' && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const blob = text.then((value) => new Blob([value], { type: 'text/plain' }))
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
      return true
    } catch {
      // Some browsers don't take a pending item; try the plain way below.
    }
  }
  try {
    await navigator.clipboard.writeText(await text)
    return true
  } catch {
    return false
  }
}

/** A "Copy branch name" button's click. */
export async function copyBranchName(name: string | Promise<string>) {
  if (await writeClipboard(name)) toast.success('Branch name copied', { description: await name })
  else toast.error('Couldn’t copy the branch name.')
}

/**
 * After the issue's branch is created (moving it into In Progress, or "Create branch"):
 * its name goes on the clipboard, ready for `git checkout`. Copying without a click
 * can be refused (the tab isn't focused, Safari), so the toast then offers the copy.
 */
export async function announceBranch(name: string, created: boolean) {
  const title = created ? `Created branch ${name}` : `Branch ${name}`
  if (await writeClipboard(name)) toast.success(title, { description: 'Copied to your clipboard.' })
  else toast.success(title, { action: { label: 'Copy', onClick: () => void copyBranchName(name) } })
}
