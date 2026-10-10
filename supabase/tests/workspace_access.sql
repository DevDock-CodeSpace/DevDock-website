-- Access check for workspace access settings and collections.
--
-- Run it against a LOCAL or rehearsal database, never production:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/workspace_access.sql
--
-- It builds a group with one person per role and one workspace per access setting, checks what each
-- person can see and do through the same policies the app uses, and rolls everything back. It raises
-- an exception listing every failed check, so a clean run means every line held.

begin;

do $$
declare
  -- People
  v_owner     uuid := gen_random_uuid();
  v_admin     uuid := gen_random_uuid();
  v_lead      uuid := gen_random_uuid(); -- lead of every workspace
  v_member    uuid := gen_random_uuid(); -- added to every workspace
  v_collected uuid := gen_random_uuid(); -- in the collection, added to no workspace
  v_bystander uuid := gen_random_uuid(); -- in the group only
  v_stranger  uuid := gen_random_uuid(); -- in another group
  -- Things
  v_team       uuid := gen_random_uuid();
  v_other_team uuid := gen_random_uuid();
  v_collection uuid;
  v_ws_members    uuid := gen_random_uuid();
  v_ws_collection uuid := gen_random_uuid();
  v_ws_group      uuid := gen_random_uuid();
  v_doc uuid;
  -- Loop state
  v_fail text[] := '{}';
  v_checks integer := 0;
  r record;
  v_sees boolean;
  v_role text;
  v_manages boolean;
  v_docs integer;
  v_count integer;
  v_state text;
  v_issue uuid;
begin
  -- ------------------------------------------------------------------ fixtures (as the table owner)
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'access-check-' || u || '@example.test', '{}'::jsonb
  from unnest(array[v_owner, v_admin, v_lead, v_member, v_collected, v_bystander, v_stranger]) as u;

  insert into public.teams (id, name, slug, type, created_by)
  values (v_team, 'Access check', 'access-check-' || left(v_team::text, 8), 'general', v_owner),
         (v_other_team, 'Access check other', 'access-check-' || left(v_other_team::text, 8), 'general', v_stranger);
  insert into public.team_members (team_id, user_id, role)
  values (v_team, v_owner, 'owner'), (v_other_team, v_stranger, 'owner')
  on conflict (team_id, user_id) do update set role = excluded.role;
  insert into public.team_members (team_id, user_id, role)
  values (v_team, v_admin, 'admin'), (v_team, v_lead, 'member'), (v_team, v_member, 'member'),
         (v_team, v_collected, 'member'), (v_team, v_bystander, 'member');

  insert into public.workspace_collections (team_id, name, type, created_by)
  values (v_team, 'Batch 2026', 'learning', v_owner) returning id into v_collection;
  insert into public.workspace_collection_members (collection_id, user_id) values (v_collection, v_collected);

  insert into public.workspaces (id, team_id, title, type, created_by, access, collection_id)
  values (v_ws_members, v_team, 'Members only', 'project', v_owner, 'members', null),
         (v_ws_collection, v_team, 'Open to the collection', 'project', v_owner, 'collection', v_collection),
         (v_ws_group, v_team, 'Open to the group', 'project', v_owner, 'group', null);
  insert into public.workspace_members (workspace_id, user_id, role)
  select w, v_lead, 'lead'::public.workspace_role from unnest(array[v_ws_members, v_ws_collection, v_ws_group]) as w
  union all
  select w, v_member, 'member'::public.workspace_role from unnest(array[v_ws_members, v_ws_collection, v_ws_group]) as w;

  insert into public.documents (team_id, workspace_id, title, created_by)
  select v_team, w, 'Doc', v_owner from unnest(array[v_ws_members, v_ws_collection, v_ws_group]) as w;

  -- ------------------------------------------------------------------ who sees what
  -- expect_role: the role private.workspace_role() must report (null = none).
  for r in
    select * from (values
      -- person,      workspace,        sees,  role,     manages
      ('owner',       'members',        true,  null,     true),
      ('owner',       'collection',     true,  null,     true),
      ('owner',       'group',          true,  'member', true),
      ('admin',       'members',        true,  null,     true),
      ('admin',       'collection',     true,  null,     true),
      ('admin',       'group',          true,  'member', true),
      ('lead',        'members',        true,  'lead',   true),
      ('lead',        'collection',     true,  'lead',   true),
      ('lead',        'group',          true,  'lead',   true),
      ('member',      'members',        true,  'member', false),
      ('member',      'collection',     true,  'member', false),
      ('member',      'group',          true,  'member', false),
      ('collected',   'members',        false, null,     false),
      ('collected',   'collection',     true,  'member', false),
      ('collected',   'group',          true,  'member', false),
      ('bystander',   'members',        false, null,     false),
      ('bystander',   'collection',     false, null,     false),
      ('bystander',   'group',          true,  'member', false),
      ('stranger',    'members',        false, null,     false),
      ('stranger',    'collection',     false, null,     false),
      ('stranger',    'group',          false, null,     false)
    ) as t (person, workspace, sees, expect_role, manages)
  loop
    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub',
      case r.person when 'owner' then v_owner when 'admin' then v_admin when 'lead' then v_lead
        when 'member' then v_member when 'collected' then v_collected when 'bystander' then v_bystander
        else v_stranger end)::text, true);
    execute 'set local role authenticated';
    execute 'select exists (select 1 from public.workspaces where id = $1),
                    private.workspace_role($1)::text,
                    private.can_manage_workspace($1),
                    (select count(*)::int from public.documents where workspace_id = $1)'
      into v_sees, v_role, v_manages, v_docs
      using case r.workspace when 'members' then v_ws_members when 'collection' then v_ws_collection else v_ws_group end;
    execute 'reset role';

    v_checks := v_checks + 1;
    if v_sees is distinct from r.sees or v_role is distinct from r.expect_role
       or v_manages is distinct from r.manages or (v_docs = 1) is distinct from r.sees then
      v_fail := v_fail || format('%s on "%s": sees=%s role=%s manages=%s docs=%s (expected sees=%s role=%s manages=%s)',
        r.person, r.workspace, v_sees, coalesce(v_role, '-'), v_manages, v_docs, r.sees, coalesce(r.expect_role, '-'), r.manages);
    end if;
  end loop;

  -- ------------------------------------------------------------------ writes by someone let in by access
  -- A person who gets in through the group setting can create an issue and be assigned one.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_bystander)::text, true);
  execute 'set local role authenticated';
  begin
    execute 'insert into public.issues (workspace_id, title, assignee_id) values ($1, $2, $3) returning id'
      into v_issue using v_ws_group, 'By a group person', v_bystander;
    v_state := 'ok';
  exception when others then v_state := sqlerrm; end;
  execute 'reset role';
  v_checks := v_checks + 1;
  if v_state <> 'ok' then v_fail := v_fail || ('bystander creating an issue in the open workspace: ' || v_state); end if;

  -- ...but not in one they cannot see, and nobody outside a workspace can be assigned in it.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_bystander)::text, true);
  execute 'set local role authenticated';
  begin
    execute 'insert into public.issues (workspace_id, title) values ($1, $2)' using v_ws_members, 'Should be refused';
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  execute 'reset role';
  v_checks := v_checks + 1;
  if v_state <> 'refused' then v_fail := v_fail || 'bystander could create an issue in the members-only workspace'; end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_member)::text, true);
  execute 'set local role authenticated';
  begin
    execute 'insert into public.issues (workspace_id, title, assignee_id) values ($1, $2, $3)'
      using v_ws_members, 'Should be refused', v_bystander;
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  begin
    execute 'insert into public.issues (workspace_id, title, assignee_id) values ($1, $2, $3)'
      using v_ws_collection, 'To a collection person', v_collected;
    v_state := v_state || '/ok';
  exception when others then v_state := v_state || '/' || sqlerrm; end;
  execute 'reset role';
  v_checks := v_checks + 2;
  if v_state <> 'refused/ok' then v_fail := v_fail || ('assigning outside / inside the workspace: ' || v_state); end if;

  -- workspace_people lists everyone exactly once, with how they got in.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_member)::text, true);
  execute 'set local role authenticated';
  execute 'select string_agg(via || ''='' || n, '','' order by via) from (
             select via, count(*) as n from public.workspace_people($1) group by via) t'
    into v_state using v_ws_group;
  execute 'reset role';
  v_checks := v_checks + 1;
  -- 2 added (lead, member) + owner, admin, collected, bystander through the group.
  if v_state is distinct from 'group=4,member=2' then v_fail := v_fail || ('workspace_people on the open workspace: ' || coalesce(v_state, 'null')); end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_bystander)::text, true);
  execute 'set local role authenticated';
  execute 'select count(*)::int from public.workspace_people($1)' into v_count using v_ws_members;
  execute 'reset role';
  v_checks := v_checks + 1;
  if v_count <> 0 then v_fail := v_fail || 'bystander could list the people of the members-only workspace'; end if;

  -- ------------------------------------------------------------------ who may change the settings
  for r in select * from (values ('lead', false), ('member', false), ('bystander', false), ('admin', true)) as t (person, allowed) loop
    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub',
      case r.person when 'lead' then v_lead when 'member' then v_member when 'bystander' then v_bystander else v_admin end)::text, true);
    execute 'set local role authenticated';
    begin
      execute 'select public.set_workspace_access($1, ''group'')' using v_ws_members;
      v_state := 'allowed';
    exception when others then v_state := 'refused'; end;
    begin
      execute 'update public.workspaces set access = ''group'' where id = $1' using v_ws_members;
      v_state := v_state || '/direct write allowed';
    exception when others then v_state := v_state || '/direct write refused'; end;
    begin
      execute 'insert into public.workspace_collection_members (collection_id, user_id) values ($1, $2)' using v_collection, v_bystander;
      v_state := v_state || '/add allowed';
    exception when others then v_state := v_state || '/add refused'; end;
    execute 'reset role';
    v_checks := v_checks + 3;
    if v_state is distinct from (case when r.allowed then 'allowed/direct write refused/add allowed' else 'refused/direct write refused/add refused' end) then
      v_fail := v_fail || format('%s changing settings: %s', r.person, v_state);
    end if;
  end loop;
  -- Undo what the admin just did.
  update public.workspaces set access = 'members' where id = v_ws_members;
  delete from public.workspace_collection_members where collection_id = v_collection and user_id = v_bystander;

  -- "collection" needs a collection.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_admin)::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select public.set_workspace_access($1, ''collection'')' using v_ws_members;
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  execute 'reset role';
  v_checks := v_checks + 1;
  if v_state <> 'refused' then v_fail := v_fail || 'a workspace outside any collection could be opened to "its collection"'; end if;

  -- Someone from another group can't be put in a collection.
  begin
    insert into public.workspace_collection_members (collection_id, user_id) values (v_collection, v_stranger);
    v_state := 'allowed';
  exception when others then v_state := 'refused'; end;
  v_checks := v_checks + 1;
  if v_state <> 'refused' then v_fail := v_fail || 'someone outside the group could be added to a collection'; end if;

  -- ------------------------------------------------------------------ nobody loses access silently
  -- Moving a workspace out of its collection keeps the collection's people as members.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_admin)::text, true);
  execute 'set local role authenticated';
  execute 'select public.set_workspace_collection($1, null)' using v_ws_collection;
  execute 'reset role';
  select access::text || '/' || coalesce(collection_id::text, 'none') || '/' ||
         (select count(*) from public.workspace_members m where m.workspace_id = v_ws_collection and m.user_id = v_collected)
  into v_state from public.workspaces where id = v_ws_collection;
  v_checks := v_checks + 1;
  if v_state <> 'members/none/1' then v_fail := v_fail || ('moving out of a collection: ' || v_state); end if;

  -- Deleting a collection does the same for every workspace open to it, and leaves the others alone.
  delete from public.workspace_members where workspace_id = v_ws_collection and user_id = v_collected;
  update public.workspaces set collection_id = v_collection, access = 'collection' where id = v_ws_collection;
  update public.workspaces set collection_id = v_collection where id = v_ws_members;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_admin)::text, true);
  execute 'set local role authenticated';
  execute 'delete from public.workspace_collections where id = $1' using v_collection;
  execute 'reset role';
  select string_agg(w.access::text || ':' || coalesce(w.collection_id::text, 'none') || ':' ||
           (select count(*) from public.workspace_members m where m.workspace_id = w.id and m.user_id = v_collected), ','
           order by w.title)
  into v_state from public.workspaces w where w.id in (v_ws_members, v_ws_collection);
  v_checks := v_checks + 1;
  -- "Members only" stays closed to them; "Open to the collection" keeps them.
  if v_state <> 'members:none:0,members:none:1' then v_fail := v_fail || ('deleting a collection: ' || v_state); end if;

  -- Leaving the group removes every way in.
  delete from public.team_members where team_id = v_team and user_id = v_bystander;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_bystander)::text, true);
  execute 'set local role authenticated';
  execute 'select count(*)::int from public.workspaces where team_id = $1' into v_count using v_team;
  execute 'reset role';
  v_checks := v_checks + 1;
  if v_count <> 0 then v_fail := v_fail || 'someone who left the group still sees its open workspace'; end if;

  -- Deleting the whole group still works with collections in it.
  insert into public.workspace_collections (team_id, name, created_by) values (v_team, 'Another', v_owner) returning id into v_collection;
  insert into public.workspace_collection_members (collection_id, user_id) values (v_collection, v_collected);
  update public.workspaces set collection_id = v_collection, access = 'collection' where id = v_ws_group;
  begin
    delete from public.teams where id = v_team;
    v_state := 'ok';
  exception when others then v_state := sqlerrm; end;
  v_checks := v_checks + 1;
  if v_state <> 'ok' then v_fail := v_fail || ('deleting a group that has collections: ' || v_state); end if;

  if array_length(v_fail, 1) > 0 then
    raise exception E'% of % access checks failed:\n  - %', array_length(v_fail, 1), v_checks, array_to_string(v_fail, E'\n  - ');
  end if;
  raise notice 'All % access checks passed.', v_checks;
end $$;

rollback;
