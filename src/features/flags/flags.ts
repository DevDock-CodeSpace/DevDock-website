/**
 * Feature flags known to the app. Each key is a row in `public.feature_flags`, added by a migration;
 * the platform admin switches it per group in the console (/admin/flags). A key here without a row is
 * always off, and a row without a key here is simply never asked about.
 *
 * Flags only show or hide things in the app. Whatever a flag guards on the server checks
 * `private.feature_enabled(team, key)` itself.
 */
export const FEATURE_FLAGS = ['ask_devdock', 'ninety_sync'] as const

export type FeatureFlag = (typeof FEATURE_FLAGS)[number]
