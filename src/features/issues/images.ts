import { removeImages, uploadImageTo } from '@/features/docs/api'
import type { Json } from '@/types/database.types'

// Images (screenshots) in issue descriptions. They are the docs editor's
// `docImage` nodes, stored in the same private bucket under
// issues/<workspace_id>/<file>. Storage RLS: everyone who can see the workspace
// views and uploads; the uploader or a workspace manager deletes.

const FOLDER = 'issues'

/** Uploads an image for an issue description and returns its storage path. */
export function uploadIssueImage(workspaceId: string, file: File): Promise<string> {
  return uploadImageTo(`${FOLDER}/${workspaceId}`, file)
}

/** The image node as the editor stores it. */
export function imageNode(path: string, alt: string): Json {
  return { type: 'docImage', attrs: { path, alt, width: 'full', align: 'center' } }
}

/** Storage paths of the issue images in a description. */
export function issueImagePaths(description: Json | null | undefined): string[] {
  const paths: string[] = []
  const walk = (node: Json | undefined) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    const attrs = node.attrs
    if (node.type === 'docImage' && attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
      if (typeof attrs.path === 'string' && attrs.path.startsWith(`${FOLDER}/`)) paths.push(attrs.path)
    }
    walk(node.content)
  }
  walk(description ?? undefined)
  return paths
}

/** Removes issue images that are no longer needed (best effort). */
export function removeIssueImages(paths: string[]) {
  return removeImages(paths.filter((path) => path.startsWith(`${FOLDER}/`)))
}
