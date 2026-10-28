-- Access check for the platform admin and feature flags (20261027110000_platform_admin_and_feature_flags).
--
-- Run it against a LOCAL or rehearsal database (DevDock Dev), never production:
--   psql "<dev or local URL>" -v ON_ERROR_STOP=1 -f supabase/tests/platform_admin.sql
--
-- It makes a platform admin, two groups with an owner and a member each, a stranger, and a test flag,
-- checks what each can call and see, and rolls everything back. It raises an exception listing every
-- failed check, so a clean run means every line held.

begin;

-- Runs one statement as a signed-in person (or anon when p_user is null) and returns its first value
-- as text, or 'ERR:<sqlstate>'. SET LOCAL is undone with the subtransaction when the statement fails.
create function pg_temp.run_as(p_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_out text;
begin
  begin
    if p_user is null then
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      execute 'set local role anon';
    else
      perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user)::text, true);
      execute 'set local role authenticated';
    end if;
    execute p_sql into v_out;
    execute 'reset role';
    return coalesce(v_out, '<null>');
  exception when others then
    execute 'reset role';
    return 'ERR:' || sqlstate;
  end;
end;
$$;

do $$
declare
  v_admin    uuid := gen_random_uuid(); -- platform admin, in no group
  v_owner_a  uuid := gen_random_uuid();
  v_member_a uuid := gen_random_uuid();
  v_owner_b  uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid(); -- in no group, not an admin
  v_team_a   uuid := gen_random_uuid();
  v_team_b   uuid := gen_random_uuid();
  v_flag     text := 'zz_check_flag';
  v_fail     text[] := '{}';
  v_checks   integer := 0;
  v_out      text;
  r          record;

  -- check(label, got, expected)
begin
  -- ------------------------------------------------------------------ fixtures (as the table owner)
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, last_sign_in_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'flag-check-' || u || '@example.test', '{}'::jsonb, now()
  from unnest(array[v_admin, v_owner_a, v_member_a, v_owner_b, v_stranger]) as u;

  insert into public.platform_admins (user_id) values (v_admin);

  insert into public.teams (id, name, slug, type, created_by)
  values (v_team_a, 'Flag check A', 'flag-check-' || left(v_team_a::text, 8), 'general', v_owner_a),
         (v_team_b, 'Flag check B', 'flag-check-' || left(v_team_b::text, 8), 'general', v_owner_b);
  insert into public.team_members (team_id, user_id, role)
  values (v_team_a, v_owner_a, 'owner'), (v_team_b, v_owner_b, 'owner')
  on conflict (team_id, user_id) do update set role = excluded.role;
  insert into public.team_members (team_id, user_id, role) values (v_team_a, v_member_a, 'member');

  insert into public.feature_flags (key, description, default_enabled) values (v_flag, 'Access check flag', false);

  -- Some group content the admin must not be able to read.
  insert into public.documents (team_id, title, created_by) values (v_team_a, 'Private plan', v_owner_a);

  -- ------------------------------------------------------------------ who is a platform admin
  for r in select * from (values
    ('platform admin', v_admin, 'true'),
    ('group owner', v_owner_a, 'false'),
    ('stranger', v_stranger, 'false')
  ) as t(label, uid, expected) loop
    v_out := pg_temp.run_as(r.uid, 'select public.am_platform_admin()::text');
    v_checks := v_checks + 1;
    if v_out <> r.expected then v_fail := v_fail || format('am_platform_admin for %s: got %s', r.label, v_out); end if;
  end loop;

  -- ------------------------------------------------------------------ console functions: admin only
  for r in select * from (values
    ('admin_overview',        'select public.admin_overview()::text'),
    ('admin_groups',          'select count(*)::text from public.admin_groups()'),
    ('admin_users',           'select count(*)::text from public.admin_users()'),
    ('admin_feature_flags',   'select count(*)::text from public.admin_feature_flags()'),
    ('admin_set_flag_default','select public.admin_set_flag_default(''zz_check_flag'', true)::text'),
    ('admin_set_team_flag',   format('select public.admin_set_team_flag(%L, ''zz_check_flag'', true)::text', v_team_a))
  ) as t(fn, sql) loop
    -- A group owner, a stranger and anon are refused.
    v_out := pg_temp.run_as(v_owner_a, r.sql);
    v_checks := v_checks + 1;
    if v_out <> 'ERR:42501' then v_fail := v_fail || format('%s as a group owner: got %s', r.fn, v_out); end if;
    v_out := pg_temp.run_as(v_stranger, r.sql);
    v_checks := v_checks + 1;
    if v_out <> 'ERR:42501' then v_fail := v_fail || format('%s as a stranger: got %s', r.fn, v_out); end if;
    v_out := pg_temp.run_as(null, r.sql);
    v_checks := v_checks + 1;
    if v_out <> 'ERR:42501' then v_fail := v_fail || format('%s as anon: got %s', r.fn, v_out); end if;
  end loop;

  -- Nothing above changed the flag.
  v_checks := v_checks + 1;
  if (select default_enabled from public.feature_flags where key = v_flag) or exists (select 1 from public.team_feature_flags where flag = v_flag) then
    v_fail := v_fail || 'a refused call still changed the flag';
  end if;

  -- ------------------------------------------------------------------ the tables are closed to clients
  for r in select * from (values
    ('read platform_admins',      'select count(*)::text from public.platform_admins'),
    ('read feature_flags',        'select count(*)::text from public.feature_flags'),
    ('read team_feature_flags',   'select count(*)::text from public.team_feature_flags'),
    ('make yourself admin',       'insert into public.platform_admins (user_id) values (auth.uid()) returning user_id::text'),
    ('add a flag override',       format('insert into public.team_feature_flags (team_id, flag, enabled) values (%L, ''zz_check_flag'', true) returning flag', v_team_a)),
    ('change a flag default',     'update public.feature_flags set default_enabled = true returning key')
  ) as t(label, sql) loop
    v_out := pg_temp.run_as(v_owner_a, r.sql);
    v_checks := v_checks + 1;
    if v_out not like 'ERR:%' then v_fail := v_fail || format('group owner could %s: %s', r.label, v_out); end if;
    -- Even the admin goes through the functions, never the tables.
    v_out := pg_temp.run_as(v_admin, r.sql);
    v_checks := v_checks + 1;
    if v_out not like 'ERR:%' then v_fail := v_fail || format('platform admin could %s directly: %s', r.label, v_out); end if;
  end loop;

  -- ------------------------------------------------------------------ the admin sees counts, not content
  v_out := pg_temp.run_as(v_admin, format('select count(*)::text from public.documents where team_id = %L', v_team_a));
  v_checks := v_checks + 1;
  if v_out <> '0' then v_fail := v_fail || format('platform admin read a group''s docs: %s', v_out); end if;
  v_out := pg_temp.run_as(v_admin, format('select count(*)::text from public.teams where id = %L', v_team_a));
  v_checks := v_checks + 1;
  if v_out <> '0' then v_fail := v_fail || format('platform admin read a group row through RLS: %s', v_out); end if;

  v_out := pg_temp.run_as(v_admin, format('select member_count || ''/'' || workspace_count || ''/'' || coalesce(owner_email, ''-'') from public.admin_groups() where id = %L', v_team_a));
  v_checks := v_checks + 1;
  if v_out <> format('2/0/flag-check-%s@example.test', v_owner_a) then v_fail := v_fail || format('admin_groups row for group A: %s', v_out); end if;

  v_out := pg_temp.run_as(v_admin, format('select is_platform_admin::text || '' '' || jsonb_array_length(groups) from public.admin_users() where id = %L', v_admin));
  v_checks := v_checks + 1;
  if v_out <> 'true 0' then v_fail := v_fail || format('admin_users row for the admin: %s', v_out); end if;
  v_out := pg_temp.run_as(v_admin, format('select groups->0->>''role'' from public.admin_users() where id = %L', v_member_a));
  v_checks := v_checks + 1;
  if v_out <> 'member' then v_fail := v_fail || format('admin_users groups for a member: %s', v_out); end if;

  v_out := pg_temp.run_as(v_admin, 'select ((admin_overview()->>''users'')::int >= 5 and (admin_overview()->>''groups'')::int >= 2 and jsonb_array_length(admin_overview()->''signups_by_week'') = 12)::text');
  v_checks := v_checks + 1;
  if v_out <> 'true' then v_fail := v_fail || format('admin_overview totals: %s', v_out); end if;
  -- The stranger is in no group and is not an admin, so is counted as without a group; the admin is not.
  v_out := pg_temp.run_as(v_admin, 'select (admin_overview()->>''users_no_group'')::int::text');
  v_checks := v_checks + 1;
  if v_out::int < 1 then v_fail := v_fail || format('admin_overview users_no_group: %s', v_out); end if;

  -- ------------------------------------------------------------------ flags: defaults and overrides
  -- Off by default: nobody sees it.
  v_out := pg_temp.run_as(v_member_a, format('select (%L = any(t.enabled_features))::text from public.teams t where t.id = %L', v_flag, v_team_a));
  v_checks := v_checks + 1;
  if v_out <> 'false' then v_fail := v_fail || format('off-by-default flag seen by a member: %s', v_out); end if;

  -- On for group A only.
  v_out := pg_temp.run_as(v_admin, format('select public.admin_set_team_flag(%L, %L, true)::text', v_team_a, v_flag));
  v_checks := v_checks + 1;
  if v_out like 'ERR:%' then v_fail := v_fail || format('admin could not switch a flag on for a group: %s', v_out); end if;
  v_out := pg_temp.run_as(v_member_a, format('select (%L = any(t.enabled_features))::text from public.teams t where t.id = %L', v_flag, v_team_a));
  v_checks := v_checks + 1;
  if v_out <> 'true' then v_fail := v_fail || format('member of a switched-on group does not see the flag: %s', v_out); end if;
  v_out := pg_temp.run_as(v_owner_b, format('select (%L = any(t.enabled_features))::text from public.teams t where t.id = %L', v_flag, v_team_b));
  v_checks := v_checks + 1;
  if v_out <> 'false' then v_fail := v_fail || format('another group sees a flag switched on for group A: %s', v_out); end if;
  v_checks := v_checks + 1;
  if not private.feature_enabled(v_team_a, v_flag) or private.feature_enabled(v_team_b, v_flag) then
    v_fail := v_fail || 'feature_enabled disagrees with the group override';
  end if;

  -- Someone outside group A can't learn its flags by building a teams row by hand.
  v_out := pg_temp.run_as(v_owner_b, format('select array_length(public.enabled_features(jsonb_populate_record(null::public.teams, jsonb_build_object(''id'', %L::uuid))), 1)::text', v_team_a));
  v_checks := v_checks + 1;
  if v_out <> '<null>' then v_fail := v_fail || format('an outsider read group A''s flags with a made-up row: %s', v_out); end if;

  -- Default on, group A switched off: B follows the default, A keeps its own setting.
  perform pg_temp.run_as(v_admin, format('select public.admin_set_flag_default(%L, true)::text', v_flag));
  perform pg_temp.run_as(v_admin, format('select public.admin_set_team_flag(%L, %L, false)::text', v_team_a, v_flag));
  v_checks := v_checks + 1;
  if private.feature_enabled(v_team_a, v_flag) or not private.feature_enabled(v_team_b, v_flag) then
    v_fail := v_fail || 'default on with group A switched off: wrong result';
  end if;
  v_out := pg_temp.run_as(v_owner_b, format('select (%L = any(t.enabled_features))::text from public.teams t where t.id = %L', v_flag, v_team_b));
  v_checks := v_checks + 1;
  if v_out <> 'true' then v_fail := v_fail || format('group B does not follow a default switched on: %s', v_out); end if;

  -- Clearing A's own setting (null) makes it follow the default again.
  perform pg_temp.run_as(v_admin, format('select public.admin_set_team_flag(%L, %L, null)::text', v_team_a, v_flag));
  v_checks := v_checks + 1;
  if not private.feature_enabled(v_team_a, v_flag) or exists (select 1 from public.team_feature_flags where team_id = v_team_a and flag = v_flag) then
    v_fail := v_fail || 'clearing a group setting did not return it to the default';
  end if;

  -- The console lists the override and the per-group state.
  perform pg_temp.run_as(v_admin, format('select public.admin_set_team_flag(%L, %L, false)::text', v_team_b, v_flag));
  v_out := pg_temp.run_as(v_admin, format('select overrides::text from public.admin_feature_flags() where key = %L', v_flag));
  v_checks := v_checks + 1;
  if v_out not like '%false%' || v_team_b || '%' then v_fail := v_fail || format('admin_feature_flags overrides: %s', v_out); end if;
  v_out := pg_temp.run_as(v_admin, format('select (%L = any(enabled_features))::text from public.admin_groups() where id = %L', v_flag, v_team_a));
  v_checks := v_checks + 1;
  if v_out <> 'true' then v_fail := v_fail || format('admin_groups enabled_features for group A: %s', v_out); end if;

  -- Bad input.
  v_out := pg_temp.run_as(v_admin, format('select public.admin_set_team_flag(%L, ''no_such_flag'', true)::text', v_team_a));
  v_checks := v_checks + 1;
  if v_out <> 'ERR:P0002' then v_fail := v_fail || format('unknown flag: got %s', v_out); end if;
  v_out := pg_temp.run_as(v_admin, format('select public.admin_set_team_flag(%L, %L, true)::text', gen_random_uuid(), v_flag));
  v_checks := v_checks + 1;
  if v_out <> 'ERR:P0002' then v_fail := v_fail || format('unknown group: got %s', v_out); end if;
  v_out := pg_temp.run_as(v_admin, 'select public.admin_set_flag_default(''no_such_flag'', true)::text');
  v_checks := v_checks + 1;
  if v_out <> 'ERR:P0002' then v_fail := v_fail || format('unknown flag default: got %s', v_out); end if;
  v_out := pg_temp.run_as(v_admin, format('select public.admin_set_flag_default(%L, null)::text', v_flag));
  v_checks := v_checks + 1;
  if v_out <> 'ERR:22004' then v_fail := v_fail || format('null default: got %s', v_out); end if;
  v_checks := v_checks + 1;
  if not private.feature_enabled(v_team_a, 'no_such_flag') is false then v_fail := v_fail || 'an unknown flag is not off'; end if;

  -- Deleting a group removes its settings.
  delete from public.teams where id = v_team_b;
  v_checks := v_checks + 1;
  if exists (select 1 from public.team_feature_flags where team_id = v_team_b) then v_fail := v_fail || 'a deleted group kept its flag settings'; end if;

  if array_length(v_fail, 1) > 0 then
    raise exception E'% of % platform admin checks failed:\n  - %', array_length(v_fail, 1), v_checks, array_to_string(v_fail, E'\n  - ');
  end if;
  raise notice 'All % platform admin checks passed.', v_checks;
end $$;

rollback;
