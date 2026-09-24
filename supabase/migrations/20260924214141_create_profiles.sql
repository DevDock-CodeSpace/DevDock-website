-- Profiles: one row per auth user, holding public-facing identity (name, avatar).
--
-- Rows are created by a trigger on auth.users (see handle_new_user below), so
-- clients never insert profiles directly. Deleting the auth user cascades.

-- ---------------------------------------------------------------------------
-- Reusable helper: keep updated_at current on any table.
-- Attach with:
--   create trigger set_updated_at before update on public.<table>
--     for each row execute function public.set_updated_at();
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger helper: sets updated_at to now() on every UPDATE.';

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 100)
);

comment on table public.profiles is
  'Public identity for each auth user. Created by the on_auth_user_created trigger.';

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges
-- Supabase grants broad table privileges to anon/authenticated by default.
-- Narrow them so RLS is not the only line of defense:
--   - anon: nothing
--   - authenticated: read, and update only the user-editable columns
--   - no INSERT (trigger creates rows) and no DELETE (cascade from auth.users)
-- ---------------------------------------------------------------------------
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- (select auth.uid()) is evaluated once per statement instead of per row.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- Profile creation: trigger on auth.users.
--
-- security definer: runs as the function owner so it can write to
-- public.profiles regardless of the signing-up user's privileges.
-- search_path = '': every reference is schema-qualified, so a malicious
-- object on the search path can't hijack it.
--
-- OAuth providers disagree on metadata keys (Google sends full_name/name and
-- avatar_url/picture) and some send none, so every field falls back to null.
-- A failing trigger would block sign-up, so nothing here can raise on bad data:
-- values are trimmed, empty strings become null, and the name is truncated to
-- fit the length constraint.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(meta ->> 'full_name'), ''),
        nullif(btrim(meta ->> 'name'), '')
      ),
      100
    ),
    coalesce(
      nullif(btrim(meta ->> 'avatar_url'), ''),
      nullif(btrim(meta ->> 'picture'), '')
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Trigger: creates a public.profiles row for each new auth.users row.';

-- Trigger functions can't be called directly, but keep them off the API surface anyway.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: users created before this migration ran (no-op on a fresh project).
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
