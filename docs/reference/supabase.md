# Supabase rules: the full wording

CLAUDE.md has the short version; this is the original, complete text (moved 2026-10-28).

## Supabase

- **Client:** `src/lib/supabase.ts` exports `supabase = createClient<Database>(…)`. It throws on import if env vars are missing or if the key is a secret/service-role key. Only import it from `api.ts`-style data modules, never from components.
- **Keys:** the frontend uses the **publishable** key (`sb_publishable_…`) only. **Frontend code must never contain a secret key (`sb_secret_…`), a legacy `service_role` key, or a DB password**, whether in source, in `VITE_` vars, or in comments/tests. Anything needing elevated privileges belongs in the database (RLS, `security definer` functions) or, later, a server-side function.
- **Schema changes go through migrations only.** Never create or alter tables, policies, functions, or triggers in the dashboard. Create them with `supabase migration new <snake_case_name>` and put the SQL in `supabase/migrations/`. Migrations are append-only: once applied anywhere, fix forward with a new migration and never edit the old file.
- **RLS is mandatory.** Every table in `public` enables RLS in the migration that creates it, with explicit policies per operation, scoped `to authenticated` (or narrower). No `using (true)` without a written justification in the migration. Use `(select auth.uid())` (evaluated once per statement), not bare `auth.uid()`.
- **Grants:** Supabase grants broad table privileges to `anon`/`authenticated` by default. Migrations revoke them and grant only what's needed (see the `profiles` migration: `select` plus column-level `update`).
- **Functions:** set `search_path = ''` and schema-qualify everything. Use `security definer` only when required (e.g. triggers on `auth.users`), and revoke `execute` from `public, anon, authenticated` unless the function is meant to be called over the API.
- **`updated_at`:** attach the shared `public.set_updated_at()` trigger to any table with that column.
- **Profiles:** created by the `on_auth_user_created` trigger (security definer, tolerant of missing OAuth metadata), not by app code. Clients can read/update only their own row, and only `display_name`/`avatar_url`.
- **Types:** `src/types/database.types.ts` is CLI-generated from the linked project. After each migration: `supabase db push`, then `npm run db:types`, then commit both. Never hand-write or hand-edit table types, and don't use `any` to get around missing types. Generated `Insert`/`Update` types ignore column grants, so the DB may still reject a write the types allow.
