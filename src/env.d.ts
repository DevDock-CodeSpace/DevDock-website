// Typed Vite env vars. Only VITE_-prefixed values reach the browser bundle,
// and everything in the bundle is public. Never add secrets here.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** The DevDock GitHub App's public slug (github.com/apps/<slug>). Optional. */
  readonly VITE_GITHUB_APP_SLUG?: string
  /** "true" shows Ask DevDock. Not a secret: the model's key lives in the ai-agent Edge Function. */
  readonly VITE_AI_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
