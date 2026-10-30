# Dev environment

Two Supabase projects (Free plan), built from the same `supabase/migrations/`, so their schemas match:

| | Project | Ref | Data |
|---|---|---|---|
| **Live** | DevDock Website | `ejqrrxxiatvvdiyxtvid` | real people (`www.calsko.com`) |
| **Dev** | DevDock Dev | `aktqcsncvbmkbleghipb` | test data from `npm run seed:dev` only |

Dev never holds a copy of live data (personal data; sign-ins can't be copied anyway).

## Using it

```bash
npm run dev         # the app against DevDock Dev (.env.devdb on top of .env)
npm run dev:live    # against live: only when you really need it
npm run seed:dev    # fills an empty DevDock Dev with test data (stops if it's already there)
```

- Sign in at `/admin-login` as `dev-admin@devdock.test` (group owner) or `dev-member@devdock.test` (member). Passwords are in the
  macOS keychain: `security find-generic-password -s "DevDock Dev admin" -w` (or `"DevDock Dev member"`).
- Keychain items: `DevDock Dev DB` (database password), `DevDock Dev secret key`, `DevDock Dev admin`, `DevDock Dev member`.
- `scripts/seed-dev.mjs` creates the two accounts with the Auth admin API, then everything else as them through the app's own
  tables and functions (RLS applies). It refuses the live URL. To start over, delete the `devdock-dev` group and run it again.

## How changes flow

- Migrations go to **Dev first**: by hand while building with
  `supabase db push --db-url "postgresql://postgres.aktqcsncvbmkbleghipb:<password>@aws-1-us-west-2.pooler.supabase.com:5432/postgres"`,
  and by `deploy-supabase.yml` on every push to `dev`. The repo stays linked to live, so a bare `supabase db push` hits live.
- **Live** gets migrations and Edge Functions on a push to `prod`. A migration applied to Dev by hand but never merged blocks
  every Dev deploy ("Remote migration versions not found"): fix with `supabase migration repair --status reverted <versions>`.
- GitHub secrets: `SUPABASE_ACCESS_TOKEN` (both projects), `SUPABASE_DB_PASSWORD` (live), `SUPABASE_DEV_DB_PASSWORD` (dev).

## Dashboard setup

- Dev Auth URLs: site `http://localhost:5173`; redirects for localhost and the Vercel preview pattern.
- Google sign-in in Dev uses the live OAuth client (the Dev callback is listed there); a Google account starts with no groups.
- Vercel: the two `VITE_SUPABASE_*` variables exist twice: Production = live, Preview = Dev. Never one row for both.
- Edge Function secrets for Dev (Gemini, JaaS) are set by hand with `--project-ref aktqcsncvbmkbleghipb` when needed.
- The GitHub App is not wired to Dev (webhooks reach one URL).

## Free plan notes

Two active free projects are allowed (the other organization's "Food Project" is paused; restoring it would hit the limit).
A free project pauses after about a week without use; restore it from the dashboard.
