-- Issue import, part 2 (owner's choices, 2026-10-26):
--
-- * People who aren't in DevDock keep the name or email the file gave them
--   (issues.import_assignee) until a lead or group admin matches it to someone
--   (public.map_import_assignee). Assigning the issue to anyone clears it.
-- * The file's sprints (Linear's cycles) can be created with the import, keeping
--   their own numbers when those are free in the project.
-- * Linear projects and milestones arrive as labels (browser side, no change here).

alter table public.issues
  add column import_assignee text,
  add constraint issues_import_assignee_length check (import_assignee is null or char_length(import_assignee) between 1 and 200);

comment on column public.issues.import_assignee is
  'An imported issue''s assignee as the file named them (name or email), while nobody in DevDock is matched to it.';

grant insert (import_assignee) on table public.issues to authenticated;

create index issues_import_assignee_idx on public.issues (workspace_id, import_assignee) where import_assignee is not null;

-- Once the issue has an assignee, the imported name has done its job.
create function private.clear_import_assignee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assignee_id is not null then
    new.import_assignee := null;
  end if;
  return new;
end;
$$;

create trigger clear_import_assignee
  before insert or update of assignee_id on public.issues
  for each row execute function private.clear_import_assignee();

revoke all on function private.clear_import_assignee() from public, anon, authenticated;

-- Sprint numbers: next in the workspace as before, except that import_issues may
-- ask for a number (devdock.cycle_number, set for one insert at a time) that is free.
create or replace function private.prepare_issue_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted integer := nullif(current_setting('devdock.cycle_number', true), '')::integer;
begin
  if tg_op = 'INSERT' then
    -- Serialize numbering per workspace (two managers creating at once).
    perform pg_advisory_xact_lock(hashtext('issue_cycles:' || new.workspace_id::text));
    if wanted is not null and wanted > 0 and not exists (
      select 1 from public.issue_cycles c where c.workspace_id = new.workspace_id and c.number = wanted
    ) then
      new.number := wanted;
    else
      select coalesce(max(c.number), 0) + 1 into new.number
      from public.issue_cycles c where c.workspace_id = new.workspace_id;
    end if;
  end if;
  -- Reversed dates are left to the issue_cycles_dates check (a clearer error
  -- than daterange's).
  if new.ends_on >= new.starts_on and exists (
    select 1 from public.issue_cycles c
    where c.workspace_id = new.workspace_id
      and c.id <> new.id
      and daterange(c.starts_on, c.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
  ) then
    raise exception 'Cycles can''t overlap' using errcode = '23P01';
  end if;
  return new;
end;
$$;

-- p_issues: as before (see 20261026200000_issue_import.sql), plus
--   import_assignee? (the file's name for someone not matched), cycle_ref? (a sprint in p_cycles).
-- p_cycles: sprints to create, oldest first:
--   { ref, number?, name?, starts_on, ends_on }. One that overlaps a sprint already
--   in the project isn't created, and its issues come in without a sprint.
-- Returns { created, skipped, labels_created, sprints_created, sprints_skipped }.
drop function public.import_issues(uuid, text, jsonb);

create function public.import_issues(p_workspace_id uuid, p_source text, p_issues jsonb, p_cycles jsonb default '[]')
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  label_name text;
  label uuid;
  new_id uuid;
  parent uuid;
  ids jsonb := '{}';          -- issue ref → issue id, for parent links
  sprints jsonb := '{}';      -- sprint ref → sprint id
  created integer := 0;
  skipped integer := 0;
  labels_created integer := 0;
  sprints_created integer := 0;
  sprints_skipped integer := 0;
begin
  if not private.can_manage_workspace(p_workspace_id) then
    raise exception 'Only workspace leads and group owners/admins can import issues' using errcode = '42501';
  end if;
  if jsonb_typeof(p_issues) <> 'array' or jsonb_typeof(coalesce(p_cycles, '[]')) <> 'array' then
    raise exception 'Issues and sprints must be lists' using errcode = '22023';
  end if;
  if jsonb_array_length(p_issues) > 1000 then
    raise exception 'At most 1000 issues per import' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_cycles, '[]')) > 200 then
    raise exception 'At most 200 sprints per import' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_cycles, '[]')) loop
    if exists (
      select 1 from public.issue_cycles c
      where c.workspace_id = p_workspace_id
        and daterange(c.starts_on, c.ends_on, '[]') && daterange((item ->> 'starts_on')::date, (item ->> 'ends_on')::date, '[]')
    ) then
      sprints_skipped := sprints_skipped + 1;
      continue;
    end if;
    perform set_config('devdock.cycle_number', coalesce(item ->> 'number', ''), true);
    insert into public.issue_cycles (workspace_id, name, starts_on, ends_on)
    values (p_workspace_id, nullif(left(btrim(item ->> 'name'), 80), ''), (item ->> 'starts_on')::date, (item ->> 'ends_on')::date)
    returning id into new_id;
    sprints := sprints || jsonb_build_object(item ->> 'ref', new_id);
    sprints_created := sprints_created + 1;
  end loop;
  perform set_config('devdock.cycle_number', '', true);

  -- Rows imported before: skipped, but sub-issues in this file can still point at them.
  select coalesce(jsonb_object_agg(i.import_ref, i.id), '{}') into ids
  from public.issues i
  where i.workspace_id = p_workspace_id
    and i.import_source = p_source
    and i.import_ref in (select x ->> 'ref' from jsonb_array_elements(p_issues) x);

  for item in select * from jsonb_array_elements(p_issues) loop
    if ids ? (item ->> 'ref') then
      skipped := skipped + 1;
      continue;
    end if;

    parent := (ids ->> (item ->> 'parent_ref'))::uuid;

    insert into public.issues (
      workspace_id, title, description, status, priority, assignee_id, import_assignee, parent_id,
      estimate, due_date, cycle_id, import_source, import_ref
    ) values (
      p_workspace_id,
      left(btrim(item ->> 'title'), 300),
      case when jsonb_typeof(item -> 'description') = 'object' then item -> 'description' end,
      coalesce((item ->> 'status')::public.issue_status, 'todo'),
      coalesce((item ->> 'priority')::smallint, 0),
      (item ->> 'assignee_id')::uuid,
      nullif(left(btrim(item ->> 'import_assignee'), 200), ''),
      parent,
      (item ->> 'estimate')::smallint,
      (item ->> 'due_date')::date,
      coalesce((item ->> 'cycle_id')::uuid, (sprints ->> (item ->> 'cycle_ref'))::uuid),
      p_source,
      item ->> 'ref'
    )
    returning id into new_id;

    ids := ids || jsonb_build_object(item ->> 'ref', new_id);
    created := created + 1;

    if jsonb_typeof(item -> 'labels') = 'array' then
      for label_name in select distinct left(btrim(x), 40) from jsonb_array_elements_text(item -> 'labels') x where btrim(x) <> '' loop
        select l.id into label from public.issue_labels l
        where l.workspace_id = p_workspace_id and lower(btrim(l.name)) = lower(label_name);
        if label is null then
          insert into public.issue_labels (workspace_id, name, color)
          values (p_workspace_id, label_name, 'default')
          returning id into label;
          labels_created := labels_created + 1;
        end if;
        insert into public.issue_label_links (issue_id, label_id, workspace_id)
        values (new_id, label, p_workspace_id)
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'created', created, 'skipped', skipped, 'labels_created', labels_created,
    'sprints_created', sprints_created, 'sprints_skipped', sprints_skipped
  );
end;
$$;

revoke all on function public.import_issues(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.import_issues(uuid, text, jsonb, jsonb) to authenticated;

-- Matches a name from an import to a person: every issue in the project still waiting
-- under that name gets them as assignee (check_issue makes sure they're in the project).
create function public.map_import_assignee(p_workspace_id uuid, p_name text, p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  matched integer;
begin
  if not private.can_manage_workspace(p_workspace_id) then
    raise exception 'Only workspace leads and group owners/admins can match imported people' using errcode = '42501';
  end if;
  update public.issues i
  set assignee_id = p_user_id
  where i.workspace_id = p_workspace_id and i.import_assignee = p_name and i.assignee_id is null;
  get diagnostics matched = row_count;
  return matched;
end;
$$;

revoke all on function public.map_import_assignee(uuid, text, uuid) from public, anon;
grant execute on function public.map_import_assignee(uuid, text, uuid) to authenticated;
