-- Access check for the Ninety sync (20261028010000_ninety_sync and its fixes).
--
-- Run it against a LOCAL or rehearsal database (DevDock Dev), never production:
--   psql "<dev or local URL>" -v ON_ERROR_STOP=1 -f supabase/tests/ninety_sync.sql
--
-- Builds a group with an owner, an admin and a member, a project with a running sprint and an issue,
-- a saved connection, and checks who can read and change what, and when issues are queued. Rolls back.

begin;

create function pg_temp.run_as(p_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_out text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user)::text, true);
    execute 'set local role authenticated';
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
  v_owner  uuid := gen_random_uuid();
  v_admin  uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_other  uuid := gen_random_uuid(); -- admin of another group
  v_team   uuid := gen_random_uuid();
  v_team2  uuid := gen_random_uuid();
  v_ws     uuid := gen_random_uuid();
  v_cycle  uuid;
  v_issue  uuid;
  v_fail   text[] := '{}';
  v_checks integer := 0;
  v_out    text;
  r        record;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ninety-check-' || u || '@example.test', '{}'::jsonb
  from unnest(array[v_owner, v_admin, v_member, v_other]) as u;
  insert into public.teams (id, name, slug, type, created_by)
  values (v_team, 'Ninety check', 'ninety-check-' || left(v_team::text, 8), 'development', v_owner),
         (v_team2, 'Ninety check 2', 'ninety-check-' || left(v_team2::text, 8), 'development', v_other);
  insert into public.team_members (team_id, user_id, role) values (v_team, v_owner, 'owner'), (v_team2, v_other, 'owner')
  on conflict (team_id, user_id) do update set role = excluded.role;
  insert into public.team_members (team_id, user_id, role) values (v_team, v_admin, 'admin'), (v_team, v_member, 'member');
  insert into public.workspaces (id, team_id, title, type, created_by) values (v_ws, v_team, 'Ninety project', 'project', v_owner);
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, v_member, 'member') on conflict do nothing;
  insert into public.issue_cycles (workspace_id, name, starts_on, ends_on) values (v_ws, 'Now', current_date - 1, current_date + 5) returning id into v_cycle;

  -- ------------------------------------------------------------------ no flag, no connection: nothing queued
  insert into public.issues (workspace_id, title, status, assignee_id, cycle_id, created_by)
  values (v_ws, 'Before connecting', 'todo', v_member, v_cycle, v_owner) returning id into v_issue;
  v_checks := v_checks + 1;
  if exists (select 1 from public.ninety_outbox where team_id = v_team) then v_fail := v_fail || 'queued before connecting'; end if;

  -- A connection (as the function would save it), but the flag is still off.
  perform set_config('role', 'service_role', true);
  perform public.ninety_save_connection(v_team, 'pat_check_token_xxxxxxxxxxxxxxxxxxxx', 'c', 'o', 'Owner', 'https://dev-dock.com', v_owner, 'https://example.test/functions/v1/ninety-sync');
  reset role;
  update public.issues set title = 'Connected, flag off' where id = v_issue;
  v_checks := v_checks + 1;
  if exists (select 1 from public.ninety_outbox where team_id = v_team) then v_fail := v_fail || 'queued while the flag is off'; end if;
  v_out := pg_temp.run_as(v_owner, format('select count(*)::text from public.ninety_connections where team_id = %L', v_team));
  v_checks := v_checks + 1;
  if v_out <> '0' then v_fail := v_fail || format('owner sees the connection while the flag is off: %s', v_out); end if;

  -- ------------------------------------------------------------------ flag on
  insert into public.team_feature_flags (team_id, flag, enabled) values (v_team, 'ninety_sync', true);

  for r in select * from (values ('owner', v_owner, '1'), ('admin', v_admin, '1'), ('member', v_member, '0'), ('other group''s admin', v_other, '0')) as t(label, uid, expected) loop
    v_out := pg_temp.run_as(r.uid, format('select count(*)::text from public.ninety_connections where team_id = %L', v_team));
    v_checks := v_checks + 1;
    if v_out <> r.expected then v_fail := v_fail || format('%s sees %s connection rows (expected %s)', r.label, v_out, r.expected); end if;
  end loop;

  -- The token never: not the column, not the Vault, not the function.
  for r in select * from (values
    ('read token_secret_id', format('select token_secret_id::text from public.ninety_connections where team_id = %L', v_team)),
    ('read the token', format('select public.ninety_token(%L)', v_team)),
    ('read the Vault', 'select count(*)::text from vault.decrypted_secrets'),
    ('read the cron secret', 'select public.ninety_cron_secret()'),
    ('read member emails', format('select count(*)::text from public.ninety_member_emails(%L)', v_team)),
    ('save a connection', format('select public.ninety_save_connection(%L, ''pat_x'', null, null, null, ''https://x.test'', null, null)::text', v_team)),
    ('queue a whole group', format('select public.ninety_queue_team_now(%L)::text', v_team)),
    ('read the outbox', 'select count(*)::text from public.ninety_outbox'),
    ('read the links', 'select count(*)::text from public.ninety_links'),
    ('read the config', 'select count(*)::text from public.ninety_config'),
    ('write a project link directly', format('insert into public.ninety_workspace_teams (workspace_id, team_id, ninety_team_id, ninety_team_name) values (%L, %L, ''x'', ''x'') returning workspace_id::text', v_ws, v_team)),
    ('edit the connection', format('update public.ninety_connections set app_url = ''https://evil.test'' where team_id = %L returning team_id::text', v_team))
  ) as t(label, sql) loop
    v_out := pg_temp.run_as(v_owner, r.sql);
    v_checks := v_checks + 1;
    if v_out not like 'ERR:%' then v_fail := v_fail || format('group owner could %s: %s', r.label, v_out); end if;
  end loop;

  -- Linking a project: admins yes, members and other groups no.
  v_out := pg_temp.run_as(v_member, format('select public.ninety_set_workspace_team(%L, ''nt1'', ''Leadership'')::text', v_ws));
  v_checks := v_checks + 1;
  if v_out <> 'ERR:42501' then v_fail := v_fail || format('member linked a project: %s', v_out); end if;
  v_out := pg_temp.run_as(v_other, format('select public.ninety_set_workspace_team(%L, ''nt1'', ''Leadership'')::text', v_ws));
  v_checks := v_checks + 1;
  if v_out <> 'ERR:42501' then v_fail := v_fail || format('another group''s admin linked a project: %s', v_out); end if;
  v_out := pg_temp.run_as(v_admin, format('select public.ninety_set_workspace_team(%L, ''nt1'', ''Leadership'')::text', v_ws));
  v_checks := v_checks + 1;
  if v_out like 'ERR:%' then v_fail := v_fail || format('admin could not link a project: %s', v_out); end if;
  v_checks := v_checks + 1;
  if not exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'linking a project did not queue its issues'; end if;

  -- Status: admins only.
  v_out := pg_temp.run_as(v_member, format('select public.ninety_status(%L)::text', v_team));
  v_checks := v_checks + 1;
  if v_out <> 'ERR:42501' then v_fail := v_fail || format('member read the status: %s', v_out); end if;

  -- ------------------------------------------------------------------ the triggers
  delete from public.ninety_outbox where team_id = v_team;
  update public.issues set description = '{"type":"doc"}'::jsonb where id = v_issue;
  v_checks := v_checks + 1;
  if exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'a description edit was queued (it isn''t sent)'; end if;
  for r in select * from (values
    ('title', 'update public.issues set title = ''Renamed'' where id = $1'),
    ('status', 'update public.issues set status = ''done'' where id = $1'),
    ('assignee', 'update public.issues set assignee_id = null where id = $1'),
    ('due date', 'update public.issues set due_date = current_date + 3 where id = $1'),
    ('sprint', 'update public.issues set cycle_id = null where id = $1')
  ) as t(label, sql) loop
    delete from public.ninety_outbox where team_id = v_team;
    execute r.sql using v_issue;
    v_checks := v_checks + 1;
    if not exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || format('a %s change was not queued', r.label); end if;
  end loop;
  update public.issues set cycle_id = v_cycle where id = v_issue;
  delete from public.ninety_outbox where team_id = v_team;
  update public.issue_cycles set ends_on = ends_on + 1 where id = v_cycle;
  v_checks := v_checks + 1;
  if not exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'a sprint date change did not queue its issues'; end if;
  delete from public.ninety_outbox where team_id = v_team;
  delete from public.issues where id = v_issue;
  v_checks := v_checks + 1;
  if not exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'a deleted issue was not queued'; end if;

  -- ------------------------------------------------------------------ phase 2: plans, Rocks team, new tables
  for r in select * from (values
    ('read the Rock links', 'select count(*)::text from public.ninety_rock_links'),
    ('read the Milestone links', 'select count(*)::text from public.ninety_milestone_links'),
    ('read the plan queue', 'select count(*)::text from public.ninety_plan_outbox'),
    ('queue a plan''s issues', format('select public.ninety_queue_plan_issues(%L, gen_random_uuid())::text', v_team))
  ) as t(label, sql) loop
    v_out := pg_temp.run_as(v_owner, r.sql);
    v_checks := v_checks + 1;
    if v_out not like 'ERR:%' then v_fail := v_fail || format('group owner could %s: %s', r.label, v_out); end if;
  end loop;

  v_out := pg_temp.run_as(v_member, format('select public.ninety_set_rocks_team(%L, ''nt1'', ''Leadership'')::text', v_team));
  v_checks := v_checks + 1;
  if v_out <> 'ERR:42501' then v_fail := v_fail || format('member chose the Rocks team: %s', v_out); end if;
  v_out := pg_temp.run_as(v_admin, format('select public.ninety_set_rocks_team(%L, ''nt1'', ''Leadership'')::text', v_team));
  v_checks := v_checks + 1;
  if v_out like 'ERR:%' or (select rocks_ninety_team_id from public.ninety_connections where team_id = v_team) is distinct from 'nt1' then
    v_fail := v_fail || format('admin could not choose the Rocks team: %s', v_out);
  end if;
  v_out := pg_temp.run_as(v_owner, format('select rocks_ninety_team_name from public.ninety_connections where team_id = %L', v_team));
  v_checks := v_checks + 1;
  if v_out <> 'Leadership' then v_fail := v_fail || format('owner can''t read the Rocks team: %s', v_out); end if;

  declare
    v_plan uuid;
  begin
    delete from public.ninety_plan_outbox where team_id = v_team;
    insert into public.plans (team_id, name, lead_id, target_on, created_by) values (v_team, 'Check plan', v_owner, current_date + 30, v_owner) returning id into v_plan;
    v_checks := v_checks + 1;
    if not exists (select 1 from public.ninety_plan_outbox where plan_id = v_plan) then v_fail := v_fail || 'a new plan was not queued'; end if;
    for r in select * from (values ('name', 'update public.plans set name = ''Check plan 2'' where id = $1'), ('status', 'update public.plans set status = ''paused'' where id = $1'),
                                   ('lead', 'update public.plans set lead_id = null where id = $1'), ('target', 'update public.plans set target_on = current_date + 60 where id = $1')) as t(label, sql) loop
      delete from public.ninety_plan_outbox where team_id = v_team;
      execute r.sql using v_plan;
      v_checks := v_checks + 1;
      if not exists (select 1 from public.ninety_plan_outbox where plan_id = v_plan) then v_fail := v_fail || format('a plan %s change was not queued', r.label); end if;
    end loop;
    insert into public.issues (workspace_id, title, status, cycle_id, created_by) values (v_ws, 'Plan issue', 'todo', v_cycle, v_owner) returning id into v_issue;
    delete from public.ninety_outbox where team_id = v_team;
    update public.issues set plan_id = v_plan where id = v_issue;
    v_checks := v_checks + 1;
    if not exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'moving an issue into a plan was not queued'; end if;
    delete from public.ninety_outbox where team_id = v_team;
    delete from public.ninety_plan_outbox where team_id = v_team;
    delete from public.plans where id = v_plan;
    v_checks := v_checks + 1;
    if not exists (select 1 from public.ninety_plan_outbox where plan_id = v_plan) then v_fail := v_fail || 'a deleted plan was not queued'; end if;
    v_checks := v_checks + 1;
    if not exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'a deleted plan''s issue was not queued'; end if;
    -- Flag off: plans aren't queued either.
    update public.team_feature_flags set enabled = false where team_id = v_team and flag = 'ninety_sync';
    delete from public.ninety_plan_outbox where team_id = v_team;
    insert into public.plans (team_id, name, created_by) values (v_team, 'Plan while off', v_owner);
    v_checks := v_checks + 1;
    if exists (select 1 from public.ninety_plan_outbox where team_id = v_team) then v_fail := v_fail || 'a plan was queued while the flag was off'; end if;
    update public.team_feature_flags set enabled = true where team_id = v_team and flag = 'ninety_sync';
  end;

  -- ------------------------------------------------------------------ phase 3: the IDS label
  declare
    v_label uuid;
    v_other_label uuid;
  begin
    select id into v_label from public.issue_labels where workspace_id = v_ws and lower(name) = 'ids';
    v_checks := v_checks + 1;
    if v_label is null then v_fail := v_fail || 'linking a project did not give it an IDS label'; end if;
    v_out := pg_temp.run_as(v_owner, 'select count(*)::text from public.ninety_issue_links');
    v_checks := v_checks + 1;
    if v_out not like 'ERR:%' then v_fail := v_fail || format('group owner could read the IDS links: %s', v_out); end if;
    v_out := pg_temp.run_as(v_owner, 'select count(*)::text from public.ninety_ids_issues(array[gen_random_uuid()])');
    v_checks := v_checks + 1;
    if v_out not like 'ERR:%' then v_fail := v_fail || format('group owner could call ninety_ids_issues: %s', v_out); end if;

    insert into public.issues (workspace_id, title, status, created_by) values (v_ws, 'Discuss me', 'todo', v_owner) returning id into v_issue;
    delete from public.ninety_outbox where team_id = v_team;
    insert into public.issue_label_links (issue_id, label_id, workspace_id) values (v_issue, v_label, v_ws);
    v_checks := v_checks + 1;
    if not exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'adding the IDS label did not queue the issue'; end if;
    delete from public.ninety_outbox where team_id = v_team;
    update public.issue_labels set name = 'Talk' where id = v_label;
    v_checks := v_checks + 1;
    if not exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'renaming IDS away did not queue its issues'; end if;
    delete from public.ninety_outbox where team_id = v_team;
    update public.issue_labels set color = 'red' where id = v_label;
    insert into public.issue_labels (workspace_id, name) values (v_ws, 'Bug') returning id into v_other_label;
    update public.issue_labels set name = 'Bugs' where id = v_other_label;
    v_checks := v_checks + 1;
    if exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'an unrelated label change queued the issue'; end if;
    update public.issue_labels set name = 'ids' where id = v_label;
    v_checks := v_checks + 1;
    if not exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'renaming a label to ids did not queue its issues'; end if;
    delete from public.ninety_outbox where team_id = v_team;
    delete from public.issue_label_links where issue_id = v_issue and label_id = v_label;
    v_checks := v_checks + 1;
    if not exists (select 1 from public.ninety_outbox where issue_id = v_issue) then v_fail := v_fail || 'removing the IDS label did not queue the issue'; end if;
    perform set_config('role', 'service_role', true);
    v_out := (select count(*)::text from public.ninety_ids_issues(array[v_issue]));
    reset role;
    v_checks := v_checks + 1;
    if v_out <> '0' then v_fail := v_fail || format('ninety_ids_issues counts an unlabelled issue: %s', v_out); end if;
  end;

  -- ------------------------------------------------------------------ disconnect
  v_out := pg_temp.run_as(v_member, format('select public.ninety_disconnect(%L)::text', v_team));
  v_checks := v_checks + 1;
  if v_out <> 'ERR:42501' then v_fail := v_fail || format('member disconnected: %s', v_out); end if;
  v_out := pg_temp.run_as(v_admin, format('select public.ninety_disconnect(%L)::text', v_team));
  v_checks := v_checks + 1;
  if v_out like 'ERR:%' or exists (select 1 from public.ninety_connections where team_id = v_team)
     or exists (select 1 from public.ninety_workspace_teams where team_id = v_team)
     or exists (select 1 from public.ninety_outbox where team_id = v_team)
     or exists (select 1 from public.ninety_plan_outbox where team_id = v_team)
     or exists (select 1 from public.ninety_issue_links where team_id = v_team) then
    v_fail := v_fail || format('disconnect left something behind: %s', v_out);
  end if;

  if array_length(v_fail, 1) > 0 then
    raise exception E'% of % Ninety checks failed:\n  - %', array_length(v_fail, 1), v_checks, array_to_string(v_fail, E'\n  - ');
  end if;
  raise notice 'All % Ninety checks passed.', v_checks;
end $$;

rollback;
