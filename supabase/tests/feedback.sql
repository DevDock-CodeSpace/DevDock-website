-- Access check for feedback (20261028120000_feedback).
--
-- Run it against a LOCAL or rehearsal database (DevDock Dev), never production:
--   psql "<dev or local URL>" -v ON_ERROR_STOP=1 -f supabase/tests/feedback.sql
--
-- It makes a platform admin, a group with a member, and a stranger; checks who can send, who can read,
-- the daily limit and marking done; and rolls everything back. It raises an exception listing every
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
  v_member   uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid(); -- in no group
  v_team     uuid := gen_random_uuid();
  v_other    uuid := gen_random_uuid(); -- a group the member isn't in
  v_fail     text[] := '{}';
  v_checks   integer := 0;
  v_out      text;
  v_id       uuid;
  i          integer;
  r          record;
begin
  -- ------------------------------------------------------------------ fixtures (as the table owner)
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, last_sign_in_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'feedback-check-' || u || '@example.test', '{}'::jsonb, now()
  from unnest(array[v_admin, v_member, v_stranger]) as u;
  insert into public.platform_admins (user_id) values (v_admin);
  insert into public.teams (id, name, slug, type, created_by)
  values (v_team, 'Feedback check', 'feedback-check-' || left(v_team::text, 8), 'general', v_member),
         (v_other, 'Feedback other', 'feedback-other-' || left(v_other::text, 8), 'general', v_admin);
  insert into public.team_members (team_id, user_id, role) values (v_team, v_member, 'owner')
  on conflict (team_id, user_id) do update set role = excluded.role;

  -- ------------------------------------------------------------------ sending
  v_out := pg_temp.run_as(v_member, format(
    $q$select public.send_feedback('problem', '  The board is slow  ', '/t/x/issues?view=board', %L, '{"screen":"1440x900"}')::text$q$, v_team));
  v_checks := v_checks + 1;
  if v_out like 'ERR:%' then v_fail := v_fail || format('a member sends feedback: got %s', v_out); end if;
  v_id := nullif(v_out, '<null>')::uuid;
  select * into r from public.feedback where id = v_id;
  v_checks := v_checks + 1;
  if r.user_id is distinct from v_member then v_fail := v_fail || text 'feedback is stamped with its sender'; end if;
  v_checks := v_checks + 1;
  if r.team_id is distinct from v_team then v_fail := v_fail || text 'the sender''s group is kept'; end if;
  v_checks := v_checks + 1;
  if r.message <> 'The board is slow' or r.status <> 'new' then v_fail := v_fail || format('message trimmed and new: got %L / %s', r.message, r.status); end if;

  -- A group they're not in is dropped, not refused.
  v_out := pg_temp.run_as(v_member, format($q$select public.send_feedback('idea', 'Dark mode', '/', %L, '{}')::text$q$, v_other));
  v_checks := v_checks + 1;
  if (select team_id from public.feedback where id = nullif(v_out, '<null>')::uuid) is not null then v_fail := v_fail || format('a group the sender isn''t in is dropped: got %s', v_out); end if;

  -- Someone in no group can send too.
  v_out := pg_temp.run_as(v_stranger, $q$select public.send_feedback('other', 'Hello', null, null, null)::text$q$);
  v_checks := v_checks + 1;
  if v_out like 'ERR:%' then v_fail := v_fail || format('someone in no group sends: got %s', v_out); end if;

  -- Bad input is refused.
  for r in select * from (values
    ('an empty message',  $q$select public.send_feedback('problem', '   ', null, null, null)::text$q$, 'ERR:23514'),
    ('an unknown kind',   $q$select public.send_feedback('rant', 'x', null, null, null)::text$q$, 'ERR:23514'),
    ('a huge message',    $q$select public.send_feedback('idea', repeat('x', 5001), null, null, null)::text$q$, 'ERR:23514'),
    ('context not an object', $q$select public.send_feedback('idea', 'x', null, null, '[1]')::text$q$, 'ERR:23514')
  ) as t(label, sql, expected) loop
    v_out := pg_temp.run_as(v_member, r.sql);
    v_checks := v_checks + 1;
    if v_out <> r.expected then v_fail := v_fail || format('%s: got %s', r.label, v_out); end if;
  end loop;

  -- Anon can't send.
  v_out := pg_temp.run_as(null, $q$select public.send_feedback('problem', 'x', null, null, null)::text$q$);
  v_checks := v_checks + 1;
  if v_out not like 'ERR:%' then v_fail := v_fail || format('anon sends: got %s', v_out); end if;

  -- ------------------------------------------------------------------ reading: platform admins only
  for r in select * from (values
    ('the table, as the sender', v_member, 'select count(*)::text from public.feedback'),
    ('the table, as a stranger', v_stranger, 'select count(*)::text from public.feedback'),
    ('admin_feedback, as the sender', v_member, 'select count(*)::text from public.admin_feedback()'),
    ('admin_feedback, as a stranger', v_stranger, 'select count(*)::text from public.admin_feedback()'),
    ('marking done, as the sender', v_member, format('select public.admin_set_feedback_status(%L, ''done'')::text', v_id)),
    ('writing the table, as the sender', v_member, format('update public.feedback set status = ''done'' where id = %L returning id::text', v_id))
  ) as t(label, uid, sql) loop
    v_out := pg_temp.run_as(r.uid, r.sql);
    v_checks := v_checks + 1;
    if v_out <> 'ERR:42501' then v_fail := v_fail || format('%s: got %s', r.label, v_out); end if;
  end loop;
  v_out := pg_temp.run_as(null, 'select count(*)::text from public.admin_feedback()');
  v_checks := v_checks + 1;
  if v_out not like 'ERR:%' then v_fail := v_fail || format('admin_feedback as anon: got %s', v_out); end if;

  v_out := pg_temp.run_as(v_admin, format(
    'select sender_email || '' / '' || team_name || '' / '' || kind from public.admin_feedback() where id = %L', v_id));
  v_checks := v_checks + 1;
  if v_out <> format('feedback-check-%s@example.test / Feedback check / problem', v_member) then v_fail := v_fail || format('the admin reads it with sender and group: got %s', v_out); end if;

  -- ------------------------------------------------------------------ marking done
  v_out := pg_temp.run_as(v_admin, format('select public.admin_set_feedback_status(%L, ''done'')::text', v_id));
  v_checks := v_checks + 1;
  if v_out like 'ERR:%' or (select status from public.feedback where id = v_id) <> 'done' or (select done_at from public.feedback where id = v_id) is null then
    v_fail := v_fail || format('the admin marks it done: got %s', v_out);
  end if;
  v_out := pg_temp.run_as(v_admin, format('select public.admin_set_feedback_status(%L, ''new'')::text', v_id));
  v_checks := v_checks + 1;
  if (select status from public.feedback where id = v_id) <> 'new' or (select done_at from public.feedback where id = v_id) is not null then
    v_fail := v_fail || text 'the admin marks it new again';
  end if;
  v_out := pg_temp.run_as(v_admin, format('select public.admin_set_feedback_status(%L, ''archived'')::text', v_id));
  v_checks := v_checks + 1;
  if v_out <> 'ERR:22023' then v_fail := v_fail || format('an unknown status: got %s', v_out); end if;
  v_out := pg_temp.run_as(v_admin, format('select public.admin_set_feedback_status(%L, ''done'')::text', gen_random_uuid()));
  v_checks := v_checks + 1;
  if v_out <> 'ERR:P0002' then v_fail := v_fail || format('unknown feedback: got %s', v_out); end if;

  -- ------------------------------------------------------------------ the daily limit (20 a day)
  for i in 1..20 loop
    v_out := pg_temp.run_as(v_stranger, $q$select public.send_feedback('idea', 'again', null, null, null)::text$q$);
  end loop;
  v_checks := v_checks + 1;
  if v_out <> 'ERR:P0001' then v_fail := v_fail || format('the 21st in a day is refused: got %s', v_out); end if;
  v_checks := v_checks + 1;
  if (select count(*) from public.feedback where user_id = v_stranger) <> 20 then v_fail := v_fail || text 'exactly 20 a day were kept'; end if;

  -- ------------------------------------------------------------------ an account going keeps its feedback
  -- (The stranger: the member owns a group, whose #general channel keeps their profile.)
  delete from auth.users where id = v_stranger;
  v_checks := v_checks + 1;
  if (select count(*) from public.feedback where user_id is null) <> 20 then v_fail := v_fail || text 'feedback outlives its sender''s account'; end if;

  if array_length(v_fail, 1) > 0 then
    raise exception E'% of % feedback checks failed:\n  - %', array_length(v_fail, 1), v_checks, array_to_string(v_fail, E'\n  - ');
  end if;
  raise notice 'All % feedback checks passed.', v_checks;
end $$;

rollback;
