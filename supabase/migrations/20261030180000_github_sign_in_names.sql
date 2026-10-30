-- GitHub sign-in (2026-10-30): many GitHub accounts have no display name, only a username
-- (raw_user_meta_data.user_name). New profiles fall back to it, so nobody shows up without a name.
-- Otherwise the same as public.handle_new_user() in 20260924214141_create_profiles.

create or replace function public.handle_new_user()
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
        nullif(btrim(meta ->> 'name'), ''),
        nullif(btrim(meta ->> 'user_name'), '')
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

revoke execute on function public.handle_new_user() from public, anon, authenticated;
