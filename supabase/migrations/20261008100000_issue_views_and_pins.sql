-- Saved issue views (a name + the filters, tab and layout to open them with, private or shared with the
-- workspace) and sidebar pins (a saved view, a person's issues, or a built-in tab, pinned by one person).

create table public.issue_views (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null,
  workspace_id uuid not null,
  owner_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name         text not null,
  shared       boolean not null default false,
  layout       text not null default 'list' check (layout in ('list', 'board')),
  tab          text not null default 'all' check (tab in ('all', 'active', 'backlog', 'mine')),
  filters      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint issue_views_workspace_fkey
    foreign key (workspace_id, team_id) references public.workspaces (id, team_id) on delete cascade,
  constraint issue_views_name_length check (char_length(name) between 1 and 60),
  constraint issue_views_filters_shape check (jsonb_typeof(filters) = 'object' and pg_column_size(filters) <= 4096)
);

comment on table public.issue_views is 'A saved issue view: filters, tab and layout. Private to its owner unless shared with the workspace.';

create unique index issue_views_owner_name_idx on public.issue_views (workspace_id, owner_id, lower(name));
create index issue_views_workspace_idx on public.issue_views (workspace_id);
create index issue_views_team_idx on public.issue_views (team_id);

create trigger set_updated_at before update on public.issue_views
  for each row execute function public.set_updated_at();

-- Fills team_id, trims the name, validates the filter document, and caps views per person and workspace.
create function private.prepare_issue_view()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facet record;
  item jsonb;
begin
  if tg_op = 'INSERT' then
    select w.team_id into new.team_id from public.workspaces w where w.id = new.workspace_id;
    if new.team_id is null then raise exception 'Workspace not found' using errcode = '23503'; end if;
    if (select count(*) from public.issue_views v where v.workspace_id = new.workspace_id and v.owner_id = new.owner_id) >= 50 then
      raise exception 'You can have at most 50 views in a workspace' using errcode = '54000';
    end if;
  end if;
  new.name := btrim(new.name);
  if jsonb_typeof(new.filters) <> 'object' then raise exception 'Invalid view filters' using errcode = '22023'; end if;
  for facet in select key, value from jsonb_each(new.filters) loop
    if facet.key not in ('status', 'priority', 'assignee', 'label', 'cycle', 'repo')
       or jsonb_typeof(facet.value) <> 'array'
       or jsonb_array_length(facet.value) > 50 then
      raise exception 'Invalid view filters' using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(facet.value) loop
      if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 64 then
        raise exception 'Invalid view filters' using errcode = '22023';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;
revoke all on function private.prepare_issue_view() from public, anon, authenticated;

create trigger prepare_issue_view before insert or update on public.issue_views
  for each row execute function private.prepare_issue_view();

revoke all on table public.issue_views from anon, authenticated;
grant select, delete on table public.issue_views to authenticated;
grant insert (workspace_id, name, shared, layout, tab, filters) on table public.issue_views to authenticated;
grant update (name, shared, layout, tab, filters) on table public.issue_views to authenticated;

alter table public.issue_views enable row level security;

create policy "People see their own and shared views"
  on public.issue_views for select to authenticated
  using (private.can_view_workspace(workspace_id) and (owner_id = (select auth.uid()) or shared));

create policy "People create their own views"
  on public.issue_views for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_view_workspace(workspace_id));

-- Owners edit their views; workspace managers can also edit and delete shared ones.
create policy "Owners and managers edit views"
  on public.issue_views for update to authenticated
  using (private.can_view_workspace(workspace_id)
         and (owner_id = (select auth.uid()) or (shared and private.can_manage_workspace(workspace_id))))
  with check (private.can_view_workspace(workspace_id)
         and (owner_id = (select auth.uid()) or (shared and private.can_manage_workspace(workspace_id))));

create policy "Owners and managers delete views"
  on public.issue_views for delete to authenticated
  using (private.can_view_workspace(workspace_id)
         and (owner_id = (select auth.uid()) or (shared and private.can_manage_workspace(workspace_id))));

-- ---------------------------------------------------------------------------------------------------
-- Pins

create table public.issue_pins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  team_id      uuid not null,
  workspace_id uuid not null,
  kind         text not null check (kind in ('view', 'person', 'tab')),
  view_id      uuid references public.issue_views (id) on delete cascade,
  person_id    uuid references public.profiles (id) on delete cascade,
  tab          text check (tab in ('all', 'active', 'backlog', 'mine')),
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint issue_pins_workspace_fkey
    foreign key (workspace_id, team_id) references public.workspaces (id, team_id) on delete cascade,
  constraint issue_pins_target check (
    (kind = 'view' and view_id is not null and person_id is null and tab is null)
    or (kind = 'person' and person_id is not null and view_id is null and tab is null)
    or (kind = 'tab' and tab is not null and view_id is null and person_id is null)
  )
);

comment on table public.issue_pins is 'An issue view, a person''s issues or a built-in tab pinned to one person''s sidebar.';

create unique index issue_pins_view_idx on public.issue_pins (user_id, view_id) where kind = 'view';
create unique index issue_pins_person_idx on public.issue_pins (user_id, workspace_id, person_id) where kind = 'person';
create unique index issue_pins_tab_idx on public.issue_pins (user_id, workspace_id, tab) where kind = 'tab';
create index issue_pins_user_idx on public.issue_pins (user_id, team_id, position);

create function private.prepare_issue_pin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select w.team_id into new.team_id from public.workspaces w where w.id = new.workspace_id;
  if new.team_id is null then raise exception 'Workspace not found' using errcode = '23503'; end if;
  if new.kind = 'person' and not exists (
    select 1 from public.team_members tm where tm.team_id = new.team_id and tm.user_id = new.person_id
  ) then
    raise exception 'That person is not in this group' using errcode = '23514';
  end if;
  if (select count(*) from public.issue_pins p where p.user_id = new.user_id and p.team_id = new.team_id) >= 30 then
    raise exception 'You can pin at most 30 items' using errcode = '54000';
  end if;
  new.position := coalesce((select max(p.position) from public.issue_pins p where p.user_id = new.user_id and p.team_id = new.team_id), 0) + 1;
  return new;
end;
$$;
revoke all on function private.prepare_issue_pin() from public, anon, authenticated;

create trigger prepare_issue_pin before insert on public.issue_pins
  for each row execute function private.prepare_issue_pin();

revoke all on table public.issue_pins from anon, authenticated;
grant select, delete on table public.issue_pins to authenticated;
grant insert (workspace_id, kind, view_id, person_id, tab) on table public.issue_pins to authenticated;
grant update (position) on table public.issue_pins to authenticated;

alter table public.issue_pins enable row level security;

create policy "People see their own pins"
  on public.issue_pins for select to authenticated
  using (user_id = (select auth.uid()) and private.can_view_workspace(workspace_id));

-- A pinned view must be one the person can see (RLS applies inside this subquery) in the same workspace.
create policy "People pin what they can see"
  on public.issue_pins for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_view_workspace(workspace_id)
    and (kind <> 'view' or exists (
      select 1 from public.issue_views v where v.id = issue_pins.view_id and v.workspace_id = issue_pins.workspace_id
    ))
  );

create policy "People reorder their own pins"
  on public.issue_pins for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "People unpin their own pins"
  on public.issue_pins for delete to authenticated
  using (user_id = (select auth.uid()));

-- Puts the caller's pins in the given order (ids not listed keep their place at the end).
create function public.reorder_issue_pins(p_team_id uuid, p_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.issue_pins p
     set position = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where p.id = o.id
     and p.team_id = p_team_id
     and p.user_id = (select auth.uid());
$$;
revoke all on function public.reorder_issue_pins(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_issue_pins(uuid, uuid[]) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['issue_views', 'issue_pins'] loop
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
