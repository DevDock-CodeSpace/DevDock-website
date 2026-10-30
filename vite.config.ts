import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // POSTHOG_KEY (PostHog's public project key) is the one non-VITE_ variable put in the bundle, by name only,
  // so other POSTHOG_ variables (a personal API key for source maps) can never reach the browser.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __POSTHOG_KEY__: JSON.stringify(env.POSTHOG_KEY ?? ''),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
