-- Platform admin and feature flags (owner's choice, 2026-10-27).
--
-- A platform admin runs DevDock itself: it belongs to no group, and has its own console (/admin) with
-- counts and names (users, groups, workspaces) and the feature flags. It never reads a group's content:
-- every existing policy stays as it is, and the console reads only through the admin_* functions below,
-- which return counts, names and dates.
--
-- Feature flags are per group: a flag has a default for every group, and a group can be switched on or
-- off on its own (team_feature_flags). Only platform admins change them. The app reads a group's enabled
-- flags as a computed column on teams (public.enabled_features), so it costs no request of its own; the
-- server asks private.feature_enabled(team, key).
--
-- Nobody becomes a platform admin from the app: rows are added by a migration (below) or by hand in SQL.

-- ---------------------------------------------------------------------------------------- tables

create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.feature_flags (
  key             text primary key check (key ~ '^[a-z][a-z0-9_]{1,47}$'),
  description     text not null check (char_length(description) between 1 and 300),
  default_enabled boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.team_feature_flags (
  team_id    uuid not null references public.teams (id) on delete cascade,
  flag       text not null references public.feature_flags (key) on delete cascade on update cascade,
  enabled    boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (team_id, flag)
);

create index team_feature_flags_flag_idx on public.team_feature_flags (flag);

create trigger set_updated_at before update on public.feature_flags
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.team_feature_flags
  for each row execute function public.set_updated_at();

-- No client reads or writes these tables directly: the functions below are the only way in. RLS is on
-- with no policies, and the default grants are revoked.
alter table public.platform_admins enable row level security;
alter table public.feature_flags enable row level security;
alter table public.team_feature_flags enable row level security;
revoke all on public.platform_admins, public.feature_flags, public.team_feature_flags from anon, authenticated;

-- ---------------------------------------------------------------------------------------- helpers

create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()));
$$;

revoke execute on function private.is_platform_admin() from public, anon, authenticated;

-- Whether a flag is on for a group: the group's own setting, else the flag's default. Unknown flags are off.
create function private.feature_enabled(p_team uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select tf.enabled from public.team_feature_flags tf where tf.team_id = p_team and tf.flag = p_key),
    (select f.default_enabled from public.feature_flags f where f.key = p_key),
    false
  );
$$;

revoke execute on function private.feature_enabled(uuid, text) from public, anon, authenticated;

-- Computed column: `teams.enabled_features`, the keys of the flags on for that group, sorted. Only a
-- member of the group (or a platform admin) gets them; anyone else calling it with a made-up row gets {}.
create function public.enabled_features(t public.teams)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not (private.is_team_member(t.id) or private.is_platform_admin()) then '{}'::text[]
    else coalesce((
      select array_agg(f.key order by f.key)
      from public.feature_flags f
      left join public.team_feature_flags tf on tf.flag = f.key and tf.team_id = t.id
      where coalesce(tf.enabled, f.default_enabled)
    ), '{}'::text[])
  end;
$$;

revoke execute on function public.enabled_features(public.teams) from public, anon;
grant execute on function public.enabled_features(public.teams) to authenticated;

-- For the app: is the signed-in person a platform admin? (Used when they have no group, and by /admin.)
create function public.am_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

revoke execute on function public.am_platform_admin() from public, anon;
grant execute on function public.am_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------------------- console reads

create function private.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only a platform admin can do that' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.require_platform_admin() from public, anon, authenticated;

-- Totals for the console's overview, and sign-ups per week for the last 12 weeks (Monday-based, UTC).
create function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_weeks jsonb;
begin
  perform private.require_platform_admin();

  select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'count', w.n) order by w.week), '[]'::jsonb)
  into v_weeks
  from (
    select s.week::date as week,
           (select count(*) from auth.users u
             where u.created_at >= s.week and u.created_at < s.week + interval '7 days') as n
    from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as s(week)
  ) w;

  return jsonb_build_object(
    'users',            (select count(*) from auth.users),
    'active_7d',        (select count(*) from auth.users u where u.last_sign_in_at >= now() - interval '7 days'),
    'active_30d',       (select count(*) from auth.users u where u.last_sign_in_at >= now() - interval '30 days'),
    'new_30d',          (select count(*) from auth.users u where u.created_at >= now() - interval '30 days'),
    'groups',           (select count(*) from public.teams),
    'workspaces',       (select count(*) from public.workspaces),
    'users_no_group',   (select count(*) from auth.users u
                          where not exists (select 1 from public.team_members m where m.user_id = u.id)
                            and not exists (select 1 from public.platform_admins a where a.user_id = u.id)),
    'signups_by_week',  v_weeks
  );
end;
$$;

-- Every group: names, counts and dates only. last_activity is the newest message, issue, doc or whiteboard change.
create function public.admin_groups()
returns table (
  id uuid,
  name text,
  slug text,
  type public.team_type,
  created_at timestamptz,
  owner_name text,
  owner_email text,
  member_count integer,
  workspace_count integer,
  last_activity timestamptz,
  enabled_features text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
  select t.id, t.name, t.slug, t.type, t.created_at,
         op.display_name, ou.email::text,
         (select count(*)::integer from public.team_members m where m.team_id = t.id),
         (select count(*)::integer from public.workspaces w where w.team_id = t.id),
         greatest(
           (select max(x.created_at) from public.messages x where x.team_id = t.id),
           (select max(x.updated_at) from public.issues x where x.team_id = t.id),
           (select max(x.updated_at) from public.documents x where x.team_id = t.id),
           (select max(x.updated_at) from public.diagrams x where x.team_id = t.id)
         ),
         public.enabled_features(t)
  from public.teams t
  left join public.team_members om on om.team_id = t.id and om.role = 'owner'
  left join public.profiles op on op.id = om.user_id
  left join auth.users ou on ou.id = om.user_id
  order by t.created_at;
end;
$$;

-- Every account: name, email, dates and the groups it is in (names and roles).
create function public.admin_users()
returns table (
  id uuid,
  display_name text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_platform_admin boolean,
  groups jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
  select u.id, p.display_name, u.email::text, u.created_at, u.last_sign_in_at,
         exists (select 1 from public.platform_admins a where a.user_id = u.id),
         coalesce((
           select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'role', m.role) order by t.name)
           from public.team_members m
           join public.teams t on t.id = m.team_id
           where m.user_id = u.id
         ), '[]'::jsonb)
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by u.created_at;
end;
$$;

-- Every flag, with the groups that override its default.
create function public.admin_feature_flags()
returns table (
  key text,
  description text,
  default_enabled boolean,
  updated_at timestamptz,
  overrides jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
  select f.key, f.description, f.default_enabled, f.updated_at,
         coalesce((
           select jsonb_agg(jsonb_build_object('team_id', tf.team_id, 'enabled', tf.enabled))
           from public.team_feature_flags tf
           where tf.flag = f.key
         ), '[]'::jsonb)
  from public.feature_flags f
  order by f.key;
end;
$$;

-- ---------------------------------------------------------------------------------------- console writes

create function public.admin_set_flag_default(p_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  if p_enabled is null then
    raise exception 'Choose on or off' using errcode = '22004';
  end if;
  update public.feature_flags set default_enabled = p_enabled where key = p_key;
  if not found then
    raise exception 'Unknown feature flag' using errcode = 'P0002';
  end if;
end;
$$;

-- p_enabled null removes the group's own setting, so the group follows the default again.
create function public.admin_set_team_flag(p_team uuid, p_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  if not exists (select 1 from public.feature_flags f where f.key = p_key) then
    raise exception 'Unknown feature flag' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.teams t where t.id = p_team) then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;
  if p_enabled is null then
    delete from public.team_feature_flags where team_id = p_team and flag = p_key;
  else
    insert into public.team_feature_flags (team_id, flag, enabled, updated_by)
    values (p_team, p_key, p_enabled, (select auth.uid()))
    on conflict (team_id, flag) do update
      set enabled = excluded.enabled, updated_by = excluded.updated_by;
  end if;
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_groups() from public, anon;
revoke execute on function public.admin_users() from public, anon;
revoke execute on function public.admin_feature_flags() from public, anon;
revoke execute on function public.admin_set_flag_default(text, boolean) from public, anon;
revoke execute on function public.admin_set_team_flag(uuid, text, boolean) from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_groups() to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_feature_flags() to authenticated;
grant execute on function public.admin_set_flag_default(text, boolean) to authenticated;
grant execute on function public.admin_set_team_flag(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------- data

-- The first flag: the planned one-way sync to Ninety (EOS). Off everywhere until switched on per group.
insert into public.feature_flags (key, description, default_enabled)
values ('ninety_sync', 'Ninety (EOS): send issues, sprints and plans to Ninety as To-Dos, Rocks, Headlines and Scorecard numbers.', false);

-- The platform admin account, in whichever project has it (created in the dashboard, never in code).
insert into public.platform_admins (user_id)
select u.id from auth.users u where lower(u.email) = 'super@admin.com'
on conflict do nothing;
