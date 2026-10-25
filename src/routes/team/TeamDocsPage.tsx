import { PageHeader } from '@/components/PageHeader'
import { FilesView } from '@/features/docs/components/FilesView'
import { useCollectionView } from '@/features/collections/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'

/** Group → Files (the URL says docs): every doc and diagram the user can open (FilesView). */
export function TeamDocsPage() {
  const { team } = useCurrentTeam()
  const { collection } = useCollectionView()
  return (
    <FilesView
      header={(placeControl) => (
        <PageHeader
          title="Files"
          description={`Every doc and diagram you can open in ${team.name}${collection ? ` · ${collection.name}` : ''}.`}
        >
          {placeControl}
        </PageHeader>
      )}
    />
  )
}
