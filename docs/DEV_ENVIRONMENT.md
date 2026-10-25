# Dev environment

DevDock has two Supabase projects in the DevDock organization (Free plan):

| | Project | Ref | Data |
|---|---|---|---|
| **Live** | DevDock Website | `ejqrrxxiatvvdiyxtvid` | real people (dev-dock.com) |
| **Dev** | DevDock Dev | `aktqcsncvbmkbleghipb` | test data from `npm run seed:dev` only |

Both are built from the same `supabase/migrations/`, so their schemas are identical (checked on 2026-10-24 by
diffing the generated types and counting policies, functions, triggers, realtime tables, buckets and cron
jobs). Dev never holds a copy of live data: it's personal data, and sign-ins can't be copied anyway.

## Using it

```bash
npm run dev         # the app against DevDock Dev (.env.devdb on top of .env)
npm run dev:live    # the app against the live project (.env): only when you really need live
npm run seed:dev    # fills an empty DevDock Dev with test data (stops if it's already there)
```

- **Sign in** at `/admin-login` as `dev-admin@devdock.test` (group owner) or `dev-member@devdock.test` (member).
  Passwords are in the macOS keychain, never in the repo:
  `security find-generic-password -s "DevDock Dev admin" -w` (or `"DevDock Dev member"`).
- **Seed:** `scripts/seed-dev.mjs` creates the two accounts with the Auth admin API (the only use of the secret
  key), then everything else signed in as them, through the same tables and functions as the app, so RLS and
  triggers apply. It refuses the live project's URL. To start over, delete the `devdock-dev` group in the app
  (or the whole project's data) and run it again.
- **Keychain items** (all generated, none printed): `DevDock Dev DB` (database password), `DevDock Dev secret key`,
  `DevDock Dev admin`, `DevDock Dev member`.

## How changes flow

- A migration is pushed to **dev first**: by hand while building
  (`supabase db push --db-url "postgresql://postgres.aktqcsncvbmkbleghipb:<password>@aws-1-us-west-2.pooler.supabase.com:5432/postgres"`,
  password from the keychain), and by `.github/workflows/deploy-supabase.yml` on every push to the `dev` branch.
  The repo stays linked to the live project, so a plain `supabase db push` still targets live: use `--db-url` for dev.
- The **live** project gets migrations and Edge Functions when `prod` is pushed (the same workflow).
- GitHub secrets: `SUPABASE_ACCESS_TOKEN` (both projects), `SUPABASE_DB_PASSWORD` (live), `SUPABASE_DEV_DB_PASSWORD` (dev).

## Set up in dashboards (not code)

| Done | What |
|---|---|
| ✅ | Project created, all 53 migrations applied, the 4 Edge Functions deployed, seed run |
| ✅ | Auth URLs: site `http://localhost:5173`; redirects for localhost and `https://dev-dock-website-*-mvish-personal.vercel.app/**` (Vercel previews) |
| ✅ | `SUPABASE_DEV_DB_PASSWORD` in GitHub secrets |
| ✅ | Google sign-in: the dev callback (`https://aktqcsncvbmkbleghipb.supabase.co/auth/v1/callback`) is on the live Google OAuth client, and DevDock Dev uses the same client ID. A Google account starts fresh in dev (no groups): join the seeded group with an invite from `dev-admin`. |
| ✅ | Vercel: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` exist twice, as **Config**: Production = live, Preview = DevDock Dev. Never one row for both (that's how previews used live data before). |
| ⬜ | **Edge Function secrets** for features you want in dev: `supabase secrets set --project-ref aktqcsncvbmkbleghipb GEMINI_API_KEY=… JAAS_APP_ID=… JAAS_KEY_ID=… JAAS_PRIVATE_KEY=…` (Ask DevDock and meetings). |
| — | GitHub App: not in dev (webhooks reach one URL). A second "DevDock Dev" App later if needed. |

## Free plan notes

- Two active free projects are allowed; the other organization's "Food Project" is paused, so it doesn't count.
  Restoring it would hit the limit.
- A free project **pauses after about a week without use**. Restore it from the dashboard (one click).
