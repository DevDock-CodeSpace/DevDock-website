-- Access check for restricted docs, whiteboards and folders (migration 20261026171024_restricted_files).
--
-- Run it against a LOCAL or rehearsal database (DevDock Dev), never production:
--   psql "<dev or local url>" -v ON_ERROR_STOP=1 -f supabase/tests/restricted_files.sql
--
-- It builds a group with one person per role, a workspace, and restricted and open items; checks what
-- each person can see and do through the same policies the app uses; and rolls everything back. It
-- raises an exception listing every failed check, so a clean run means every line held.

begin;

do $$
declare
  -- People
  v_owner     uuid := gen_random_uuid(); -- group owner
  v_admin     uuid := gen_random_uuid(); -- group admin
  v_lead      uuid := gen_random_uuid(); -- lead of the workspace (a writer, not an admin)
  v_member    uuid := gen_random_uuid(); -- workspace member; makes the restricted doc
  v_viewer    uuid := gen_random_uuid(); -- workspace member; shared things as a viewer
  v_editor    uuid := gen_random_uuid(); -- workspace member; shared a doc as an editor
  v_bystander uuid := gen_random_uuid(); -- workspace member; shared nothing
  v_outsider  uuid := gen_random_uuid(); -- in the group, not in the workspace
  -- Things
  v_team uuid := gen_random_uuid();
  v_ws   uuid := gen_random_uuid();
  v_doc_open uuid; v_doc_r uuid; v_folder_r uuid; v_doc_in uuid; v_sub_in uuid; v_diagram_r uuid;
  v_folder_parent uuid; v_folder_secret uuid;
  -- Loop state
  v_fail text[] := '{}';
  v_checks integer := 0;
  r record;
  v_sees boolean;
  v_rows integer;
  v_ok boolean;
begin
  -- ------------------------------------------------------------------ fixtures (as the table owner)
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'restricted-check-' || u || '@example.test', '{}'::jsonb
  from unnest(array[v_owner, v_admin, v_lead, v_member, v_viewer, v_editor, v_bystander, v_outsider]) as u;

  insert into public.teams (id, name, slug, type, created_by)
  values (v_team, 'Restricted check', 'restricted-check-' || left(v_team::text, 8), 'general', v_owner);
  insert into public.team_members (team_id, user_id, role) values (v_team, v_owner, 'owner')
  on conflict (team_id, user_id) do update set role = excluded.role;
  insert into public.team_members (team_id, user_id, role)
  values (v_team, v_admin, 'admin'), (v_team, v_lead, 'member'), (v_team, v_member, 'member'),
         (v_team, v_viewer, 'member'), (v_team, v_editor, 'member'), (v_team, v_bystander, 'member'),
         (v_team, v_outsider, 'member');

  insert into public.workspaces (id, team_id, title, type, created_by, access)
  values (v_ws, v_team, 'Project', 'project', v_owner, 'members');
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_ws, v_lead, 'lead'), (v_ws, v_member, 'member'), (v_ws, v_viewer, 'member'),
         (v_ws, v_editor, 'member'), (v_ws, v_bystander, 'member');

  insert into public.documents (team_id, workspace_id, title, created_by)
  values (v_team, v_ws, 'Open doc', v_lead) returning id into v_doc_open;
  insert into public.documents (team_id, workspace_id, title, created_by, access)
  values (v_team, v_ws, 'Restricted doc', v_member, 'restricted') returning id into v_doc_r;
  insert into public.doc_folders (team_id, workspace_id, name, created_by, access, depth)
  values (v_team, v_ws, 'Restricted folder', v_lead, 'restricted', 1) returning id into v_folder_r;
  insert into public.documents (team_id, workspace_id, folder_id, title, created_by)
  values (v_team, v_ws, v_folder_r, 'Open doc in the restricted folder', v_lead) returning id into v_doc_in;
  insert into public.doc_folders (team_id, workspace_id, parent_id, name, created_by, depth)
  values (v_team, v_ws, v_folder_r, 'Open folder in the restricted folder', v_lead, 2) returning id into v_sub_in;
  insert into public.diagrams (team_id, workspace_id, title, data, created_by, access)
  values (v_team, v_ws, 'Restricted whiteboard', '{}', v_lead, 'restricted') returning id into v_diagram_r;
  -- For "can't delete what holds a folder you can't open": an open folder holding the admin's restricted one.
  insert into public.doc_folders (team_id, workspace_id, name, created_by, depth)
  values (v_team, v_ws, 'Parent', v_lead, 1) returning id into v_folder_parent;
  insert into public.doc_folders (team_id, workspace_id, parent_id, name, created_by, access, depth)
  values (v_team, v_ws, v_folder_parent, 'Admin only', v_admin, 'restricted', 2) returning id into v_folder_secret;

  insert into public.file_shares (document_id, user_id, role) values (v_doc_r, v_viewer, 'viewer'), (v_doc_r, v_editor, 'editor');
  insert into public.file_shares (folder_id, user_id, role) values (v_folder_r, v_viewer, 'viewer');

  -- ------------------------------------------------------------------ who sees what
  for r in
    select * from (values
      -- person,      what,              sees
      ('owner',      'doc_open',         true),
      ('outsider',   'doc_open',         false),
      ('bystander',  'doc_open',         true),
      ('owner',      'doc_r',            true),
      ('admin',      'doc_r',            true),
      ('lead',       'doc_r',            false),
      ('member',     'doc_r',            true),
      ('viewer',     'doc_r',            true),
      ('editor',     'doc_r',            true),
      ('bystander',  'doc_r',            false),
      ('outsider',   'doc_r',            false),
      ('admin',      'folder_r',         true),
      ('lead',       'folder_r',         true),
      ('viewer',     'folder_r',         true),
      ('editor',     'folder_r',         false),
      ('member',     'folder_r',         false),
      ('bystander',  'folder_r',         false),
      ('lead',       'doc_in',           true),
      ('viewer',     'doc_in',           true),
      ('member',     'doc_in',           false),
      ('bystander',  'doc_in',           false),
      ('admin',      'doc_in',           true),
      ('viewer',     'sub_in',           true),
      ('bystander',  'sub_in',           false),
      ('lead',       'diagram_r',        true),
      ('admin',      'diagram_r',        true),
      ('member',     'diagram_r',        false),
      ('bystander',  'diagram_r',        false)
    ) as t(person, what, sees)
  loop
    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub',
      case r.person when 'owner' then v_owner when 'admin' then v_admin when 'lead' then v_lead when 'member' then v_member
        when 'viewer' then v_viewer when 'editor' then v_editor when 'bystander' then v_bystander else v_outsider end)::text, true);
    execute 'set local role authenticated';
    execute case
        when r.what in ('folder_r', 'sub_in') then 'select exists (select 1 from public.doc_folders where id = $1)'
        when r.what = 'diagram_r' then 'select exists (select 1 from public.diagrams where id = $1)'
        else 'select exists (select 1 from public.documents where id = $1)'
      end
      into v_sees
      using case r.what when 'doc_open' then v_doc_open when 'doc_r' then v_doc_r when 'folder_r' then v_folder_r
        when 'doc_in' then v_doc_in when 'sub_in' then v_sub_in else v_diagram_r end;
    execute 'reset role';
    v_checks := v_checks + 1;
    if v_sees is distinct from r.sees then
      v_fail := v_fail || format('%s sees %s: expected %s, got %s', r.person, r.what, r.sees, v_sees);
    end if;
  end loop;

  -- ------------------------------------------------------------------ what they can change
  -- A small helper pattern: impersonate, run, count rows, go back.
  -- viewer can't edit the restricted doc; editor can; bystander (can't see it) changes nothing.
  for r in select * from (values ('viewer', 0), ('editor', 1), ('bystander', 0), ('lead', 0)) as t(person, expect) loop
    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub',
      case r.person when 'viewer' then v_viewer when 'editor' then v_editor when 'bystander' then v_bystander else v_lead end)::text, true);
    execute 'set local role authenticated';
    execute 'with u as (update public.documents set title = title || ''!'' where id = $1 returning 1) select count(*) from u' into v_rows using v_doc_r;
    execute 'reset role';
    v_checks := v_checks + 1;
    if v_rows <> r.expect then v_fail := v_fail || format('%s edits the restricted doc: expected %s rows, got %s', r.person, r.expect, v_rows); end if;
  end loop;

  -- The viewer of a restricted folder only views what is inside it.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_viewer)::text, true);
  execute 'set local role authenticated';
  execute 'with u as (update public.documents set title = title || ''!'' where id = $1 returning 1) select count(*) from u' into v_rows using v_doc_in;
  execute 'reset role';
  v_checks := v_checks + 1;
  if v_rows <> 0 then v_fail := v_fail || 'viewer of the restricted folder edited a doc inside it'; end if;

  -- Nobody puts things in a folder they can't open.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_member)::text, true);
  execute 'set local role authenticated';
  v_ok := false;
  begin
    execute 'insert into public.documents (team_id, workspace_id, folder_id, title) values ($1, $2, $3, $4)' using v_team, v_ws, v_folder_r, 'Sneaking in';
  exception when others then v_ok := true;
  end;
  execute 'reset role';
  v_checks := v_checks + 1;
  if not v_ok then v_fail := v_fail || 'a member created a doc inside a restricted folder they can''t open'; end if;

  -- Only the owner (or an admin) changes who may open it: the shared editor can't make it open.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_editor)::text, true);
  execute 'set local role authenticated';
  v_ok := false;
  begin
    execute 'update public.documents set access = ''place'' where id = $1' using v_doc_r;
  exception when others then v_ok := true;
  end;
  execute 'reset role';
  v_checks := v_checks + 1;
  if not v_ok then v_fail := v_fail || 'a shared editor changed the doc''s access'; end if;

  -- Sharing: the viewer can't share; the owner (member) can share with someone in the workspace,
  -- but not with someone who can't open the workspace.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_viewer)::text, true);
  execute 'set local role authenticated';
  v_ok := false;
  begin
    execute 'insert into public.file_shares (document_id, user_id, role) values ($1, $2, ''viewer'')' using v_doc_r, v_bystander;
  exception when others then v_ok := true;
  end;
  execute 'reset role';
  v_checks := v_checks + 1;
  if not v_ok then v_fail := v_fail || 'a viewer shared the doc'; end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_member)::text, true);
  execute 'set local role authenticated';
  begin
    execute 'insert into public.file_shares (document_id, user_id, role) values ($1, $2, ''viewer'')' using v_doc_r, v_bystander;
    v_ok := true;
  exception when others then v_ok := false;
  end;
  v_checks := v_checks + 1;
  if not v_ok then v_fail := v_fail || 'the owner could not share with someone in the workspace'; end if;
  v_ok := false;
  begin
    execute 'insert into public.file_shares (document_id, user_id, role) values ($1, $2, ''viewer'')' using v_doc_r, v_outsider;
  exception when others then v_ok := true;
  end;
  execute 'reset role';
  v_checks := v_checks + 1;
  if not v_ok then v_fail := v_fail || 'the owner shared with someone outside the workspace'; end if;

  -- The bystander now sees it (just shared).
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_bystander)::text, true);
  execute 'set local role authenticated';
  execute 'select exists (select 1 from public.documents where id = $1)' into v_sees using v_doc_r;
  execute 'reset role';
  v_checks := v_checks + 1;
  if not v_sees then v_fail := v_fail || 'sharing with the bystander did not let them see it'; end if;

  -- A lead can't move what they can't see, or delete a folder holding one they can't open.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_lead)::text, true);
  execute 'set local role authenticated';
  v_ok := false;
  begin
    execute 'select public.move_folder_items(array[$1]::uuid[], ''{}''::uuid[], ''{}''::uuid[], null)' using v_doc_r;
  exception when others then v_ok := true;
  end;
  v_checks := v_checks + 1;
  if not v_ok then v_fail := v_fail || 'a lead moved a restricted doc they can''t see'; end if;
  v_ok := false;
  begin
    execute 'delete from public.doc_folders where id = $1' using v_folder_parent;
  exception when others then v_ok := true;
  end;
  execute 'reset role';
  v_checks := v_checks + 1;
  if not v_ok then v_fail := v_fail || 'a lead deleted a folder holding a restricted folder they can''t open'; end if;

  -- The admin can delete it (they see everything).
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_admin)::text, true);
  execute 'set local role authenticated';
  execute 'with d as (delete from public.doc_folders where id = $1 returning 1) select count(*) from d' into v_rows using v_folder_parent;
  execute 'reset role';
  v_checks := v_checks + 1;
  if v_rows <> 1 then v_fail := v_fail || 'the admin could not delete the folder'; end if;

  if cardinality(v_fail) > 0 then
    raise exception E'% of % checks failed:\n%', cardinality(v_fail), v_checks, array_to_string(v_fail, E'\n');
  end if;
  raise notice 'restricted files: all % checks passed', v_checks;
end;
$$;

rollback;
