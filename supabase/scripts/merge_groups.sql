-- One-time: fold one group into another as two collections.
--
--   GROUP  <target>  (renamed, type General)
--   ├── Collection <target_collection>   the target's people, holding what was already in it
--   └── Collection <source_collection>   the source's people, holding everything moved from the source
--
-- What moves: the source's workspaces (courses, projects, spaces) with everything inside them, and its
-- people (as plain members of the target; see `keep_admins`). Who can see each workspace does not
-- change: every workspace keeps its access setting and the people added to it.
--
-- What stays in the source group: its chat, and its group-wide docs, diagrams and meetings (unless
-- `move_group_content` is on, which makes them group-wide in the target: visible to everyone there).
-- The source group itself is left in place, emptied of workspaces. Delete it by hand when you are sure.
--
-- It needs the workspace_access_and_collections migration. Rehearse on a copy first. It runs in one
-- transaction and ROLLS BACK unless apply=1:
--
--   psql "$DB" -v ON_ERROR_STOP=1 \
--     -v source=dev-dock -v target=dev-dock-coding \
--     -v new_name='DevDock' -v source_collection='Learning' -v target_collection='Development' \
--     -v keep_admins=0 -v move_group_content=0 -v apply=0 \
--     -f supabase/scripts/merge_groups.sql
--
-- keep_admins=0  the source's owner and admins join the target as members and become leads of every
--                moved workspace, so they still run their courses but gain nothing over the target's
--                own projects. keep_admins=1 makes them admins of the whole merged group instead.

\set ON_ERROR_STOP on
begin;

select set_config('merge.source', :'source', true),
       set_config('merge.target', :'target', true),
       set_config('merge.new_name', :'new_name', true),
       set_config('merge.source_collection', :'source_collection', true),
       set_config('merge.target_collection', :'target_collection', true),
       set_config('merge.keep_admins', :'keep_admins', true),
       set_config('merge.move_group_content', :'move_group_content', true) \gset ignored_

do $$
declare
  v_source uuid;
  v_target uuid;
  v_source_coll uuid;
  v_target_coll uuid;
  v_keep_admins boolean := current_setting('merge.keep_admins') = '1';
  v_move_content boolean := current_setting('merge.move_group_content') = '1';
  v_moved uuid[];
  -- Tables that carry a workspace's team_id next to its workspace_id.
  v_tables text[] := array['workspace_members', 'documents', 'doc_folders', 'diagrams', 'live_sessions',
                           'issues', 'issue_views', 'issue_pins'];
  v_table text;
  v_fk record;
  v_fks jsonb := '[]'::jsonb;
  v_count bigint;
  v_note text;
begin
  select id into v_source from public.teams where slug = current_setting('merge.source');
  select id into v_target from public.teams where slug = current_setting('merge.target');
  if v_source is null or v_target is null or v_source = v_target then
    raise exception 'Need two different existing groups (source "%", target "%")',
      current_setting('merge.source'), current_setting('merge.target');
  end if;
  select array_agg(id) into v_moved from public.workspaces where team_id = v_source;
  if v_moved is null then
    raise exception 'The source group has no workspaces to move';
  end if;
  -- Repositories belong to a group, so a linked repo cannot follow its workspace.
  if exists (select 1 from public.workspace_repos r where r.workspace_id = any (v_moved)) then
    raise exception 'A workspace in the source group is linked to a repository. Unlink it first.';
  end if;

  -- ------------------------------------------------------------------ the target group
  update public.teams
  set name = coalesce(nullif(current_setting('merge.new_name'), ''), name),
      type = 'general' -- the only type that holds courses and projects together
  where id = v_target;

  -- ------------------------------------------------------------------ people
  -- Collections first take a snapshot of who is in the target today.
  insert into public.workspace_collections (team_id, name, type, created_by)
  values (v_target, current_setting('merge.target_collection'), 'development', null)
  returning id into v_target_coll;
  insert into public.workspace_collection_members (collection_id, user_id)
  select v_target_coll, m.user_id from public.team_members m where m.team_id = v_target;

  insert into public.team_members (team_id, user_id, role)
  select v_target, m.user_id,
         case when v_keep_admins and m.role in ('owner', 'admin') then 'admin' else 'member' end::public.team_role
  from public.team_members m
  where m.team_id = v_source
  on conflict (team_id, user_id) do nothing; -- someone in both keeps their role in the target
  get diagnostics v_count = row_count;
  raise notice 'People added to the target group: %', v_count;

  insert into public.workspace_collections (team_id, name, type, created_by)
  values (v_target, current_setting('merge.source_collection'), 'learning', null)
  returning id into v_source_coll;
  insert into public.workspace_collection_members (collection_id, user_id)
  select v_source_coll, m.user_id from public.team_members m where m.team_id = v_source;

  -- What was already in the target goes into its collection (access settings untouched).
  update public.workspaces set collection_id = v_target_coll where team_id = v_target and collection_id is null;

  -- ------------------------------------------------------------------ move the workspaces
  -- A workspace's rows all point at (workspace_id, team_id), so parent and children have to change
  -- together: those foreign keys are checked at the end of this block instead of row by row. Row
  -- triggers are switched off so nothing is renumbered, re-stamped or logged as an edit.
  foreach v_table in array array['workspaces'] || v_tables loop
    execute format('alter table public.%I disable trigger user', v_table);
  end loop;
  for v_fk in
    select c.conrelid::regclass::text as tbl, c.conname
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and not c.condeferrable
      and c.conrelid::regclass::text = any (array['workspaces'] || v_tables)
      and exists (
        select 1 from pg_catalog.pg_attribute a
        where a.attrelid = c.conrelid and a.attnum = any (c.conkey) and a.attname = 'team_id')
      and c.confrelid::regclass::text not in ('teams', 'team_members')
  loop
    execute format('alter table public.%I alter constraint %I deferrable initially deferred', v_fk.tbl, v_fk.conname);
    v_fks := v_fks || jsonb_build_object('tbl', v_fk.tbl, 'con', v_fk.conname);
  end loop;

  update public.workspaces set team_id = v_target, collection_id = v_source_coll where id = any (v_moved);
  foreach v_table in array v_tables loop
    execute format('update public.%I set team_id = $1 where workspace_id = any ($2)', v_table) using v_target, v_moved;
    get diagnostics v_count = row_count;
    raise notice '  % rows moved in %', v_count, v_table;
  end loop;

  if v_move_content then
    foreach v_table in array array['doc_folders', 'documents', 'diagrams', 'live_sessions'] loop
      execute format('update public.%I set team_id = $1 where team_id = $2 and workspace_id is null', v_table)
        using v_target, v_source;
      get diagnostics v_count = row_count;
      raise notice '  % group-wide rows moved in %', v_count, v_table;
    end loop;
  end if;

  -- Check the deferred foreign keys now, then put everything back the way it was.
  set constraints all immediate;
  for v_fk in select x ->> 'tbl' as tbl, x ->> 'con' as conname from jsonb_array_elements(v_fks) as x loop
    execute format('alter table public.%I alter constraint %I not deferrable', v_fk.tbl, v_fk.conname);
  end loop;
  foreach v_table in array array['workspaces'] || v_tables loop
    execute format('alter table public.%I enable trigger user', v_table);
  end loop;

  -- The source's owner and admins keep running what they ran.
  if not v_keep_admins then
    insert into public.workspace_members (workspace_id, user_id, role)
    select w, m.user_id, 'lead'
    from unnest(v_moved) as w
    join public.team_members m on m.team_id = v_source and m.role in ('owner', 'admin')
    -- ...unless they are an owner or admin of the target anyway.
    where not exists (
      select 1 from public.team_members t
      where t.team_id = v_target and t.user_id = m.user_id and t.role in ('owner', 'admin'))
    on conflict (workspace_id, user_id) do update set role = 'lead';
    get diagnostics v_count = row_count;
    raise notice 'Source owners/admins made leads of the moved workspaces: % rows', v_count;
  end if;

  -- ------------------------------------------------------------------ verify
  for v_table in select unnest(v_tables) loop
    execute format(
      'select count(*) from public.%I c join public.workspaces w on w.id = c.workspace_id where c.team_id <> w.team_id', v_table)
      into v_count;
    if v_count > 0 then raise exception '% rows in % point at the wrong group', v_count, v_table; end if;
  end loop;
  if exists (select 1 from public.workspaces where team_id = v_source) then
    raise exception 'A workspace is still in the source group';
  end if;
  if exists (
    select 1 from public.workspace_members wm
    where not exists (select 1 from public.team_members tm where tm.team_id = wm.team_id and tm.user_id = wm.user_id)) then
    raise exception 'A workspace member is not in the group';
  end if;
  select string_agg(issue_key, ', ') into v_note
  from (select issue_key from public.workspaces where team_id = v_target group by issue_key having count(*) > 1) d;
  if v_note is not null then
    raise notice 'Heads-up: two workspaces in the merged group share an issue key (%). Change one in its settings.', v_note;
  end if;

  raise notice 'Moved % workspace(s) into "%". Collections: "%" (% people), "%" (% people).',
    array_length(v_moved, 1),
    (select name from public.teams where id = v_target),
    current_setting('merge.target_collection'),
    (select count(*) from public.workspace_collection_members where collection_id = v_target_coll),
    current_setting('merge.source_collection'),
    (select count(*) from public.workspace_collection_members where collection_id = v_source_coll);
end $$;

-- What the merged group looks like.
select t.name as "group", t.type, coalesce(c.name, '(none)') as collection, w.title, w.type as kind, w.access,
       (select count(*) from public.workspace_members m where m.workspace_id = w.id) as added_people
from public.workspaces w
join public.teams t on t.id = w.team_id
left join public.workspace_collections c on c.id = w.collection_id
where t.slug = :'target'
order by c.position, w.title;

select t.slug as "group", m.role, count(*) as people
from public.team_members m join public.teams t on t.id = m.team_id
where t.slug in (:'source', :'target')
group by 1, 2 order by 1, 2;

\if :apply
  commit;
  \echo 'APPLIED.'
\else
  rollback;
  \echo 'Rolled back (dry run). Re-run with -v apply=1 to keep it.'
\endif
