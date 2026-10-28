import { useCurrentTeam } from '@/features/teams/hooks'
import type { FeatureFlag } from './flags'

/**
 * Whether a feature flag is on for the group in the URL. Read from the cached groups list
 * (`myTeamsQuery`), so it costs no request. UI only: the server checks the flag again.
 */
export function useFeature(flag: FeatureFlag): boolean {
  const { features } = useCurrentTeam()
  return features.includes(flag)
}
