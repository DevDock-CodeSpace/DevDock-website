# DevDock

A private software-engineering teaching workspace for one instructor and a few students.

Built with React, TypeScript, Vite, React Router, Tailwind CSS, shadcn/ui and TanStack Query. The backend is Supabase. Deployed on Vercel.

## Running the app

```bash
npm install
npm run dev        # http://localhost:5173
```

Sign-in uses **Google via Supabase Auth**, so the app needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see [Environment variables](#environment-variables)). Teams, workspaces and memberships come from the database; Exercises is a placeholder until its tables exist.

Checks, before every pull request: one command runs them all (lint, typecheck and production build, then the performance budget):

```bash
npm run check
```

GitHub runs the same command on every pull request, so a failing check shows up there too. Individually: `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run perf` (run after a build; it fails if the first load of the app gets heavier or an editor leaks into it). The performance rules the project follows are in `.claude/skills/devdock-performance/SKILL.md`.

Node 22 LTS is recommended. Node 20 is end-of-life, and newer `@supabase/supabase-js` releases require Node ≥ 22. The repo is currently pinned to a supabase-js version that still supports Node 20.

---

## Supabase

### What it's for

| Supabase feature | DevDock use |
|---|---|
| Auth | Sign-in with Google (OAuth, PKCE flow) |
| Postgres | Profiles, teams, workspaces, memberships and invites; lessons and resources later |
| Row Level Security | The authorization layer: who can read or change which rows |
| Storage | Later: uploaded files |

The browser talks to Supabase directly with a **publishable** key. That key is public by design, so security comes from RLS policies in the database, not from hiding the key.

### Environment variables

Copy `.env.example` to `.env.local` (or `.env`; both are git-ignored) and fill in:

| Variable | Where to find it | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Dashboard → Project Settings → API | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Dashboard → Project Settings → API Keys | `sb_publishable_...` (a legacy `anon` key also works) |

**Never** put a secret key (`sb_secret_...`), a legacy `service_role` key, or the database password in any `VITE_` variable or in frontend code. Everything with the `VITE_` prefix ships to the browser. `src/lib/supabase.ts` refuses to start if it detects a secret or service-role key.

### Creating the Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard). Choose a region near your users and store the database password in a password manager (the CLI asks for it when linking).
2. Copy the project URL and publishable key into `.env.local`.
3. Install the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) (`brew install supabase`; update with `brew upgrade supabase`), then:

   ```bash
   supabase login
   supabase link --project-ref <project-ref>   # prompts for the DB password
   ```

The CLI is only needed for database work. The React app doesn't need it, and neither step above needs Docker.

### Migrations

The schema lives in Git. **Tables, policies, functions, and triggers are never created by hand in the dashboard.**

```
supabase/
  config.toml                    # CLI + local-stack config
  migrations/
    <timestamp>_<name>.sql       # applied in timestamp order, exactly once each
```

- Create a new migration with `supabase migration new <snake_case_name>`, then write SQL in the generated file.
- Migrations are append-only. Once a migration has been applied anywhere, change the schema with a *new* migration and never edit the old one.
- Every new table enables RLS in the same migration that creates it.

Current migrations (all applied to the hosted project):

| Migration | What it does |
|---|---|
| `20260924214141_create_profiles.sql` | `profiles` table, `set_updated_at()` helper, RLS policies, and a trigger that creates a profile for each new auth user |
| `20260925000709_create_workspaces_and_courses.sql` | Role model (originally "workspaces → courses"), with memberships, roles, the exactly-one-owner rule and RLS |
| `20260925001632_add_workspace_invites.sql` | Invite codes and a join-by-code RPC |
| `20260925002856_profiles_visible_to_workspace_peers.sql` | Lets people who share a group see each other's name and avatar |
| `20260925010950_rename_to_teams_and_workspaces.sql` | **Renames to the current model:** teams (+ type) → workspaces (+ type), `team_role` and `workspace_role`, `join_team(invite_code)`. All policies and functions are recreated with the new names. |

**Applying migrations to the hosted project** (after linking):

```bash
supabase db push --dry-run   # show what would run
supabase db push             # apply pending migrations
supabase migration list      # compare local vs. remote
```

Optional local stack (**requires Docker**): `supabase start` runs Postgres, Auth, and Studio locally, and `supabase db reset` rebuilds the local DB from the migrations. It isn't needed to develop the frontend.

### Database types

`src/types/database.types.ts` is generated by the Supabase CLI from the linked project's schema. Don't edit it by hand.

To regenerate after a migration has been pushed:

```bash
npm run db:types
# = supabase gen types typescript --linked --schema public > src/types/database.types.ts
```

Commit the generated file. Re-run the command after every migration.

(With the local Docker stack you can use `supabase gen types typescript --local` instead.)

### Profiles

- `public.profiles` holds one row per `auth.users` row: `display_name`, `avatar_url`, `created_at`, `updated_at`.
- Rows are created by the `on_auth_user_created` trigger, which copies the name and avatar from OAuth metadata when they exist and leaves them null otherwise.
- RLS: a signed-in user can **read** and **update** only their own profile. Anonymous users can't read profiles at all. Clients can't insert or delete profiles, and can only change `display_name` and `avatar_url`.
- People who share a **team** can read each other's profile (name and avatar). There is no other visibility.
- Generated `Insert`/`Update` types list every column, but database grants are stricter. Clients can only update `display_name` and `avatar_url`, and can't insert profiles at all.

### Data model

```
team  (owner | admin | member; type: learning | development | general)
 ├── team_members, team_invites  (join with an invite code → member)
 └── workspaces  (type: course | project | general)
      └── workspace_members  (lead | member; must already be in the team)
```

- **Roles live only in the membership tables.** A person can hold a different role in each team and workspace.
- **Joining a team doesn't grant workspace access.** Team owners/admins, or a workspace's lead, add people to a workspace.
- **URLs:** `/t/:teamSlug` shows a team's workspaces; `/t/:teamSlug/w/:workspaceId` is a workspace.

---

## Authentication

### How it works

- **Provider:** Google only, through Supabase Auth. There's no email/password, magic link or sign-up form.
- **Flow:** PKCE.
  1. `/login` calls `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: <origin>/auth/callback })`.
  2. The browser goes to Google, then to Supabase's `/auth/v1/callback`.
  3. Supabase sends it back to `/auth/callback?code=…`.
  4. supabase-js swaps that one-time code for a session on startup (`detectSessionInUrl`), and the `/auth/callback` loader sends the user to the page they originally asked for.
- **Session:** supabase-js keeps it in `localStorage` and refreshes tokens automatically, so a page refresh keeps you signed in.
- **Route protection:** the authenticated layout's loader (`appLoader` → `requireUser`) runs *before* anything renders, and redirects to `/login?next=<requested path>` when there's no session.
  - `/login` redirects already-signed-in users to `next` (or `/app`).
  - `next` accepts only same-site paths, so it can't be used as an open redirect.
  - A loading screen shows while the session is restored.
- **Staying in sync:** `onAuthStateChange` watches for identity changes: sign-out in another tab, or a session that expired and couldn't be refreshed. On a change it clears the TanStack Query cache and re-runs the route loaders, which redirect as needed.
- **Identity in the UI:** the sidebar shows the `profiles` row (name and avatar). If the profile is missing or fails to load, it falls back to the Google account details.
- **Sign out** (sidebar user menu) ends this browser's session, clears cached data, and goes to `/login`.
- **Security:** route guards are only for the user experience. **The database is the security boundary:** RLS lets a user read and update only their own profile.

Code lives in `src/features/auth/` (`api.ts`, `loaders.ts`, `hooks.ts`, `session.ts`, `redirect.ts`, `components/`), plus `src/routes/LoginPage.tsx` and `src/layouts/app-loader.ts`.

### Google Cloud setup

In [Google Cloud Console](https://console.cloud.google.com/) → **Google Auth Platform**:

1. **Branding / Audience:** set the app name (DevDock) and support email. The user type is **External**.
   - While the publishing status is **Testing**, only the accounts listed under **Audience → Test users** can sign in. Add yourself and your students, or publish the app. Sign-in alone uses only the basic `openid`, `email` and `profile` scopes, which don't require Google's app verification — but the optional Calendar sync does (see [Meetings and calendars](#meetings-and-calendars)).
2. **Data Access:** the scopes are `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`, plus `.../auth/calendar.events` if you want the Calendar sync below.
3. **Clients → Create client → Web application:**
   - **Authorized JavaScript origins:** `http://localhost:5173`, plus each deployed origin later.
   - **Authorized redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`. This is Supabase's callback, *not* the app's `/auth/callback`.
   - Copy the **Client ID** and **Client secret** into Supabase (next section). **The client secret never goes in `.env` or frontend code.**

### Supabase Auth setup

In the Supabase Dashboard → **Authentication**:

1. **Sign In / Providers → Google:**
   - Enable it, and paste the Google **Client ID** and **Client Secret**.
   - Leave *Skip nonce checks* and *Allow users without an email* **off**.
   - The *Callback URL* shown there must match the Google redirect URI above.
2. **URL Configuration:**
   - **Site URL:** `http://localhost:5173` for now.
   - **Redirect URLs:** `http://localhost:5173/**` (or exactly `http://localhost:5173/auth/callback`).

The app always sends `redirectTo = window.location.origin + '/auth/callback'`, so no URLs are hardcoded. Each environment's origin just needs to be on the allow-list.

**When deploying to Vercel or a custom domain:**
- **Supabase:** set **Site URL** to the production origin. Add `https://<domain>/auth/callback` to **Redirect URLs**, plus `https://*-<team>.vercel.app/**` if you want preview deployments to work.
- **Google:** add the production origin to **Authorized JavaScript origins**. The redirect URI stays the Supabase callback.
- **Vercel:** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the project's environment variables.

`supabase/config.toml` only configures the optional local Docker stack. The hosted project is configured in the dashboard.

## Meetings and calendars

Meetings (the UI name for `live_sessions`) reach people's calendars three ways, in increasing order of setup:

1. **Add to calendar links** — pre-filled Google Calendar and Outlook/Teams URLs. The person clicks Save. No setup, no account connection, works everywhere.
2. **Download .ics** — a standard calendar file, for one meeting or a whole repeating series. Opens in Outlook/Teams, Google and Apple Calendar. No setup. Neither of these invites anyone; they add the meeting to the calendar of whoever clicks.
3. **Google Calendar sync** — DevDock creates the event in the organizer's Google Calendar and emails an invite to everyone in the audience. This is the only automatic option.

### Turning on Google Calendar sync

The sync needs the `calendar.events` scope, which Google classes as **sensitive**. That means:

- While the consent screen is in **Testing**, each organizer sees an "unverified app" warning *and must re-approve every 7 days*. That's what makes it feel broken.
- Switching the consent screen to **Production** (Google Auth Platform → Audience → Publish app) removes the weekly re-approval. The warning screen then appears once per person.
- Removing the warning entirely needs Google's verification: app verification only, **no security assessment** (that's for restricted scopes), and roughly 3–5 business days. Not required below 100 users.

### Why there's no Outlook/Teams sync

Evaluated and rejected in October 2026; don't retry it without new information. Creating events in Outlook needs a Microsoft Entra app registration, and Microsoft **blocks end users from consenting to newly registered multitenant apps whose publisher isn't verified** when they ask for more than basic sign-in. `Calendars.ReadWrite` is more than basic sign-in. Becoming a verified publisher needs a Microsoft Cloud Partner Program account with a verified Partner Global Account — a business registration, out of proportion here.

In practice an organizer's work account could only connect if their employer's IT granted admin consent. Teams meeting *creation* is a separate dead end: it needs a paid Microsoft 365 business or school account and can't be done for personal accounts at all. The Outlook link (option 1) covers the everyday need in two clicks.

## GitHub App setup

Connecting a group to GitHub (Group settings → Repositories → **Connect GitHub**) uses a GitHub App that you own. The `github` Edge Function holds its keys. Until they're set, the button is hidden and repos can only be added by name.

1. **Create the App:** GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**. For an org, create it under the org's settings instead.
   - **Name:** anything unique, e.g. `DevDock-<you>`. Its URL slug (`github.com/apps/<slug>`) is used below.
   - **Homepage URL:** your DevDock origin, e.g. `http://localhost:5173`.
   - **Callback URL:** `http://localhost:5173/github/callback`. Add one per deployed origin later (up to 10).
   - Tick **Request user authorization (OAuth) during installation**. DevDock uses that one-time sign-in to check that the person connecting really has access to the installation.
   - **Webhook:** tick *Active*.
     - URL: `https://<project-ref>.supabase.co/functions/v1/github-webhook`
     - Secret: a random value, also set as `GITHUB_WEBHOOK_SECRET` (step 4)
     - Under **Subscribe to events**, tick **Pull request**. Installation events are always sent.
   - **Repository permissions:**
     - Contents: **Read and write** (9d creates branches; asking now avoids a re-approval later)
     - Pull requests: **Read-only**
     - Metadata: Read-only (automatic)
   - **Where can this GitHub App be installed:** *Only on this account* if all repos live there; otherwise *Any account*.
2. **After creating it:**
   - Note the **App ID** and **Client ID**.
   - **Generate a new client secret**.
   - **Generate a private key**, which downloads a `.pem` file.
3. **Convert the key to PKCS#8** (GitHub's is PKCS#1):
   `openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in <downloaded>.pem -out github-app-pkcs8.pem`
4. **Set the Edge Function secrets** (never `VITE_` vars):
   ```bash
   supabase secrets set GITHUB_APP_ID=<app id> GITHUB_CLIENT_ID=<client id> GITHUB_CLIENT_SECRET=<client secret>
   supabase secrets set GITHUB_APP_PRIVATE_KEY="$(cat github-app-pkcs8.pem)"
   supabase secrets set GITHUB_WEBHOOK_SECRET=<the webhook secret>
   ```
   Then delete both `.pem` files.
5. **Show the button:** set `VITE_GITHUB_APP_SLUG=<slug>` in `.env.local` (and in Vercel later), then restart `npm run dev`. The slug isn't a secret.

### Not implemented yet (intentionally)

- Lessons, resources and live sessions (no tables yet; the pages are placeholders).
- **Restricting who can sign in.** Any Google account that Google allows (see *Testing* mode above) can sign in, and any signed-in user can create their own team. They can't see or join anyone else's without an invite code.
