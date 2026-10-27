-- Issue import, part 3 (owner's choice, 2026-10-26): who the people named in imported files are.
--
-- issue_import_people remembers, per project, each name or email a file used for an assignee and
-- the DevDock person it stands for (null until someone is chosen). Project Settings lists it, so
-- leads see who is mapped to whom; changing a mapping assigns the issues still waiting under that
-- name; and later imports match the same names by themselves.
--
-- Written by import_issues (the file's names, with whoever the import matched them to) and by
-- map_import_assignee. Both run as the caller, so the policies below decide: workspace managers write,
-- everyone in the workspace reads (they already see the names on the issues).

create table public.issue_import_people (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  user_id      uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (workspace_id, name),
  constraint issue_import_people_name_length check (char_length(name) between 1 and 200)
);

comment on table public.issue_import_people is
  'Names (or emails) imported files used for assignees, per project, and the person each stands for.';

create index issue_import_people_user_idx on public.issue_import_people (user_id);

create trigger set_updated_at
  before update on public.issue_import_people
  for each row execute function public.set_updated_at();

-- The person must be able to open the project (the same rule as an issue's assignee).
create function private.check_issue_import_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and not private.has_workspace_access(new.workspace_id, new.user_id) then
    raise exception 'That person isn''t in this project' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_issue_import_person
  before insert or update on public.issue_import_people
  for each row execute function private.check_issue_import_person();

revoke all on function private.check_issue_import_person() from public, anon, authenticated;

revoke all on table public.issue_import_people from anon, authenticated;
grant select, delete on table public.issue_import_people to authenticated;
grant insert (workspace_id, name, user_id), update (user_id) on table public.issue_import_people to authenticated;

alter table public.issue_import_people enable row level security;

create policy "Workspace viewers read imported people"
  on public.issue_import_people for select to authenticated
  using (private.can_view_workspace(workspace_id));

create policy "Workspace managers add imported people"
  on public.issue_import_people for insert to authenticated
  with check (private.can_manage_workspace(workspace_id));

create policy "Workspace managers map imported people"
  on public.issue_import_people for update to authenticated
  using (private.can_manage_workspace(workspace_id))
  with check (private.can_manage_workspace(workspace_id));

create policy "Workspace managers forget imported people"
  on public.issue_import_people for delete to authenticated
  using (private.can_manage_workspace(workspace_id));

-- Names already kept on issues by part 2.
insert into public.issue_import_people (workspace_id, name)
select distinct i.workspace_id, i.import_assignee from public.issues i where i.import_assignee is not null
on conflict do nothing;

-- import_issues gains p_people: [{ name, user_id? }], every assignee name in the file with the person
-- the import matched it to (null = kept by name). A known mapping isn't cleared by a null.
drop function public.import_issues(uuid, text, jsonb, jsonb);

create function public.import_issues(p_workspace_id uuid, p_source text, p_issues jsonb, p_cycles jsonb default '[]', p_people jsonb default '[]')
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
  if jsonb_typeof(p_issues) <> 'array' or jsonb_typeof(coalesce(p_cycles, '[]')) <> 'array' or jsonb_typeof(coalesce(p_people, '[]')) <> 'array' then
    raise exception 'Issues, sprints and people must be lists' using errcode = '22023';
  end if;
  if jsonb_array_length(p_issues) > 1000 then
    raise exception 'At most 1000 issues per import' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_cycles, '[]')) > 200 or jsonb_array_length(coalesce(p_people, '[]')) > 1000 then
    raise exception 'Too many sprints or people in one import' using errcode = '22023';
  end if;

  insert into public.issue_import_people as p (workspace_id, name, user_id)
  select distinct on (left(btrim(x ->> 'name'), 200)) p_workspace_id, left(btrim(x ->> 'name'), 200), (x ->> 'user_id')::uuid
  from jsonb_array_elements(coalesce(p_people, '[]')) x
  where btrim(coalesce(x ->> 'name', '')) <> ''
  on conflict (workspace_id, name) do update set user_id = coalesce(excluded.user_id, p.user_id)
    where excluded.user_id is not null and excluded.user_id is distinct from p.user_id;

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

revoke all on function public.import_issues(uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_issues(uuid, text, jsonb, jsonb, jsonb) to authenticated;

-- Maps an imported name to a person (or back to nobody), and assigns the issues still waiting
-- under that name. Issues already assigned are left alone. Returns how many were assigned.
create or replace function public.map_import_assignee(p_workspace_id uuid, p_name text, p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  matched integer := 0;
begin
  if not private.can_manage_workspace(p_workspace_id) then
    raise exception 'Only workspace leads and group owners/admins can match imported people' using errcode = '42501';
  end if;
  insert into public.issue_import_people as p (workspace_id, name, user_id)
  values (p_workspace_id, p_name, p_user_id)
  on conflict (workspace_id, name) do update set user_id = excluded.user_id;
  if p_user_id is not null then
    update public.issues i
    set assignee_id = p_user_id
    where i.workspace_id = p_workspace_id and i.import_assignee = p_name and i.assignee_id is null;
    get diagnostics matched = row_count;
  end if;
  return matched;
end;
$$;

-- Settings → Import: every name with its person and how many issues still wait under it. One request.
create function public.import_people(p_workspace_id uuid)
returns table (name text, user_id uuid, waiting integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.name, p.user_id,
    (select count(*)::integer from public.issues i
     where i.workspace_id = p.workspace_id and i.import_assignee = p.name and i.assignee_id is null)
  from public.issue_import_people p
  where p.workspace_id = p_workspace_id
  order by p.user_id is not null, lower(p.name);
$$;

revoke all on function public.import_people(uuid) from public, anon;
grant execute on function public.import_people(uuid) to authenticated;
