-- Reminder checks: privacy, what a reminder may point at, the status rules, and delivery.
--
-- Run it against a LOCAL or rehearsal database, never production:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/reminders.sql
--
-- It builds a group with two people and a members-only workspace, acts as each person through the
-- same policies the app uses, runs the scheduler by hand, and rolls everything back. It raises an
-- exception listing every failed check, so a clean run means every line held.

begin;

-- Acts as a signed-in person until the next act_as / reset role.
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user)::text, true);
  execute 'set local role authenticated';
end $$;

do $$
declare
  v_alice uuid := gen_random_uuid(); -- owns the reminders, in the workspace
  v_bob   uuid := gen_random_uuid(); -- same group, not in the workspace
  v_owner uuid := gen_random_uuid(); -- the group's owner
  v_team       uuid := gen_random_uuid();
  v_other_team uuid := gen_random_uuid();
  v_ws    uuid := gen_random_uuid();
  v_issue uuid;
  v_plain uuid;
  v_about uuid;
  v_due uuid;
  v_future uuid;
  v_done uuid;
  v_gone uuid;
  v_row public.reminders;
  v_count integer;
  v_state text;
  v_fail text[] := '{}';
  v_checks integer := 0;
begin
  -- ------------------------------------------------------------------ fixtures (as the table owner)
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'reminder-check-' || u || '@example.test', '{}'::jsonb
  from unnest(array[v_alice, v_bob, v_owner]) as u;

  -- Owners see every workspace, so the group's owner is a third person and Alice and Bob are members.
  insert into public.teams (id, name, slug, type, created_by)
  values (v_team, 'Reminder check', 'reminder-check-' || left(v_team::text, 8), 'development', v_owner),
         (v_other_team, 'Reminder check other', 'reminder-check-' || left(v_other_team::text, 8), 'development', v_bob);
  insert into public.team_members (team_id, user_id, role)
  values (v_team, v_owner, 'owner'), (v_other_team, v_bob, 'owner')
  on conflict (team_id, user_id) do update set role = excluded.role;
  insert into public.team_members (team_id, user_id, role) values (v_team, v_alice, 'member'), (v_team, v_bob, 'member');

  insert into public.workspaces (id, team_id, title, type, created_by, access)
  values (v_ws, v_team, 'Members only', 'project', v_alice, 'members');
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, v_alice, 'member');

  perform pg_temp.act_as(v_alice);
  insert into public.issues (workspace_id, title) values (v_ws, 'Login bug') returning id into v_issue;
  execute 'reset role';

  -- ------------------------------------------------------------------ creating, as Alice
  perform pg_temp.act_as(v_alice);
  insert into public.reminders (team_id, title, remind_at)
  values (v_team, '  Deploy staging  ', now() + interval '1 day') returning * into v_row;
  v_plain := v_row.id;
  v_checks := v_checks + 3;
  if v_row.user_id <> v_alice then v_fail := v_fail || 'the owner is not the signed-in person'::text; end if;
  if v_row.title <> 'Deploy staging' then v_fail := v_fail || 'the title is not trimmed'::text; end if;
  if v_row.status <> 'pending' then v_fail := v_fail || 'a new reminder is not pending'::text; end if;

  insert into public.reminders (team_id, issue_id, title, remind_at)
  values (v_team, v_issue, 'Review the bug', now() + interval '2 days') returning * into v_row;
  v_about := v_row.id;
  v_checks := v_checks + 1;
  if v_row.workspace_id is distinct from v_ws then v_fail := v_fail || 'an issue does not bring its workspace'::text; end if;

  begin
    insert into public.reminders (team_id, user_id, title, remind_at) values (v_team, v_bob, 'For Bob', now());
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  v_checks := v_checks + 1;
  if v_state <> 'refused' then v_fail := v_fail || 'a reminder can be created for someone else'::text; end if;

  begin
    update public.reminders set notified_at = now() where id = v_plain;
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  v_checks := v_checks + 1;
  if v_state <> 'refused' then v_fail := v_fail || 'a client can set notified_at'::text; end if;

  begin
    insert into public.reminders (team_id, title, remind_at) values (v_team, '   ', now());
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  v_checks := v_checks + 1;
  if v_state <> 'refused' then v_fail := v_fail || 'a blank title is accepted'::text; end if;
  execute 'reset role';

  -- ------------------------------------------------------------------ privacy and references, as Bob
  perform pg_temp.act_as(v_bob);
  select count(*) into v_count from public.reminders where id in (v_plain, v_about);
  v_checks := v_checks + 1;
  if v_count <> 0 then v_fail := v_fail || 'someone else reads the reminders'::text; end if;

  begin
    update public.reminders set title = 'Hijacked' where id = v_plain;
    get diagnostics v_count = row_count;
  exception when others then v_count := 0; end;
  v_checks := v_checks + 1;
  if v_count <> 0 then v_fail := v_fail || 'someone else edits the reminders'::text; end if;

  begin
    insert into public.reminders (team_id, workspace_id, title, remind_at) values (v_team, v_ws, 'Peek', now());
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  v_checks := v_checks + 1;
  if v_state <> 'refused' then v_fail := v_fail || 'a reminder can point at a workspace its owner cannot open'::text; end if;

  begin
    insert into public.reminders (team_id, issue_id, title, remind_at) values (v_team, v_issue, 'Peek', now());
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  v_checks := v_checks + 1;
  if v_state <> 'refused' then v_fail := v_fail || 'a reminder can point at an issue its owner cannot open'::text; end if;

  begin
    insert into public.reminders (team_id, issue_id, title, remind_at) values (v_other_team, v_issue, 'Cross', now());
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  v_checks := v_checks + 1;
  if v_state <> 'refused' then v_fail := v_fail || 'a reminder can point at an issue in another group'::text; end if;
  execute 'reset role';

  -- Alice is in only one of the two groups.
  perform pg_temp.act_as(v_alice);
  begin
    insert into public.reminders (team_id, title, remind_at) values (v_other_team, 'Elsewhere', now());
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  v_checks := v_checks + 1;
  if v_state <> 'refused' then v_fail := v_fail || 'a reminder can be created in a group its owner is not in'::text; end if;

  -- ------------------------------------------------------------------ status rules
  update public.reminders set status = 'completed' where id = v_plain returning * into v_row;
  v_checks := v_checks + 1;
  if v_row.completed_at is null or v_row.cancelled_at is not null then v_fail := v_fail || 'completing does not stamp completed_at'::text; end if;
  update public.reminders set status = 'pending' where id = v_plain returning * into v_row;
  v_checks := v_checks + 1;
  if v_row.completed_at is not null then v_fail := v_fail || 'reopening keeps completed_at'::text; end if;
  update public.reminders set status = 'cancelled' where id = v_plain returning * into v_row;
  v_checks := v_checks + 1;
  if v_row.cancelled_at is null then v_fail := v_fail || 'cancelling does not stamp cancelled_at'::text; end if;

  -- Choosing no workspace drops the issue.
  update public.reminders set workspace_id = null where id = v_about returning * into v_row;
  v_checks := v_checks + 1;
  if v_row.issue_id is not null then v_fail := v_fail || 'removing the workspace keeps the issue'::text; end if;
  update public.reminders set issue_id = v_issue where id = v_about;

  -- ------------------------------------------------------------------ delivery
  insert into public.reminders (team_id, title, remind_at) values (v_team, 'Due', now() + interval '1 hour') returning id into v_due;
  insert into public.reminders (team_id, title, remind_at) values (v_team, 'Future', now() + interval '1 hour') returning id into v_future;
  insert into public.reminders (team_id, title, remind_at) values (v_team, 'Done', now() + interval '1 hour') returning id into v_done;
  update public.reminders set status = 'completed' where id = v_done;
  execute 'reset role';
  -- Time passes (as the owner of the table, so nothing else changes): two are now overdue, as after
  -- the job was down, and the cancelled one is due too.
  update public.reminders set remind_at = now() - interval '10 minutes' where id in (v_due, v_done, v_plain);

  perform private.fire_due_reminders();
  perform private.fire_due_reminders();

  select count(*) into v_count from public.notifications where reminder_id = v_due and kind = 'reminder' and recipient_id = v_alice and team_id = v_team;
  v_checks := v_checks + 1;
  if v_count <> 1 then v_fail := v_fail || format('a due reminder made %s notifications (running twice)', v_count); end if;
  select count(*) into v_count from public.notifications where reminder_id in (v_future, v_done, v_plain, v_about);
  v_checks := v_checks + 1;
  if v_count <> 0 then v_fail := v_fail || 'a future, completed or cancelled reminder fired'::text; end if;
  v_checks := v_checks + 1;
  if (select notified_at from public.reminders where id = v_due) is null then v_fail := v_fail || 'firing does not set notified_at'::text; end if;

  -- The owner reads the notification and its reminder through the bell's embed; Bob doesn't.
  perform pg_temp.act_as(v_alice);
  select count(*) into v_count from public.notifications n join public.reminders r on r.id = n.reminder_id where n.reminder_id = v_due;
  v_checks := v_checks + 1;
  if v_count <> 1 then v_fail := v_fail || 'the owner cannot read the reminder notification'::text; end if;

  -- Snooze: a later time lets it fire again, once.
  update public.reminders set remind_at = now() + interval '1 hour' where id = v_due returning * into v_row;
  v_checks := v_checks + 1;
  if v_row.notified_at is not null then v_fail := v_fail || 'snoozing keeps notified_at'::text; end if;
  execute 'reset role';
  update public.reminders set remind_at = now() - interval '1 minute' where id = v_due;
  perform private.fire_due_reminders();
  perform private.fire_due_reminders();
  select count(*) into v_count from public.notifications where reminder_id = v_due;
  v_checks := v_checks + 1;
  if v_count <> 2 then v_fail := v_fail || format('a snoozed reminder has %s notifications, expected 2', v_count); end if;

  -- Completing clears its notifications from the bell.
  perform pg_temp.act_as(v_alice);
  update public.reminders set status = 'completed' where id = v_due;
  execute 'reset role';
  select count(*) into v_count from public.notifications where reminder_id = v_due and read_at is null;
  v_checks := v_checks + 1;
  if v_count <> 0 then v_fail := v_fail || 'completing a reminder leaves its notification unread'::text; end if;

  -- ------------------------------------------------------------------ notes without a time
  -- A note may have no time: it never fires. Giving it one makes it fire; taking the time away
  -- and giving a new one re-arms a note that already fired.
  perform pg_temp.act_as(v_alice);
  insert into public.reminders (team_id, title) values (v_team, 'Just a note') returning id into v_about;
  execute 'reset role';
  perform private.fire_due_reminders();
  select count(*) into v_count from public.notifications where reminder_id = v_about;
  v_checks := v_checks + 1;
  if v_count <> 0 then v_fail := v_fail || 'a note without a time fired'::text; end if;
  update public.reminders set remind_at = now() - interval '1 minute' where id = v_about;
  perform private.fire_due_reminders();
  select count(*) into v_count from public.notifications where reminder_id = v_about;
  v_checks := v_checks + 1;
  if v_count <> 1 then v_fail := v_fail || format('a note given a time fired %s times, expected 1', v_count); end if;
  perform pg_temp.act_as(v_alice);
  update public.reminders set remind_at = null where id = v_about returning * into v_row;
  v_checks := v_checks + 1;
  if v_row.notified_at is not null then v_fail := v_fail || 'clearing the time keeps notified_at'::text; end if;
  execute 'reset role';
  perform private.fire_due_reminders();
  select count(*) into v_count from public.notifications where reminder_id = v_about;
  v_checks := v_checks + 1;
  if v_count <> 1 then v_fail := v_fail || 'a note with its time cleared fired again'::text; end if;

  -- ------------------------------------------------------------------ deletes elsewhere
  -- Deleting the issue keeps the reminder, without the issue; deleting the workspace, without it.
  perform pg_temp.act_as(v_alice);
  insert into public.reminders (team_id, issue_id, title, remind_at) values (v_team, v_issue, 'About to lose its issue', now() + interval '1 day') returning id into v_gone;
  execute 'reset role';
  delete from public.issues where id = v_issue;
  select * into v_row from public.reminders where id = v_gone;
  v_checks := v_checks + 1;
  if v_row.id is null or v_row.issue_id is not null or v_row.workspace_id is distinct from v_ws then
    v_fail := v_fail || 'deleting an issue does not keep its reminders'::text;
  end if;
  delete from public.workspaces where id = v_ws;
  select * into v_row from public.reminders where id = v_gone;
  v_checks := v_checks + 1;
  if v_row.id is null or v_row.workspace_id is not null then v_fail := v_fail || 'deleting a workspace does not keep its reminders'::text; end if;

  -- Leaving the group removes your reminders in it.
  delete from public.team_members where team_id = v_team and user_id = v_alice;
  select count(*) into v_count from public.reminders where user_id = v_alice;
  v_checks := v_checks + 1;
  if v_count <> 0 then v_fail := v_fail || 'leaving the group keeps its reminders'::text; end if;

  if array_length(v_fail, 1) > 0 then
    raise exception E'% of % reminder checks failed:\n  - %', array_length(v_fail, 1), v_checks, array_to_string(v_fail, E'\n  - ');
  end if;
  raise notice 'All % reminder checks passed.', v_checks;
end $$;

rollback;
