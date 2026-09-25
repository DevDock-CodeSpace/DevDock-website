-- Issues (Linear-style), phase 1: issues with sub-issues, status, priority,
-- assignee, labels, estimate, due date, and comments. Issues always belong
-- to one workspace (no team-wide issues).
--
-- Identifiers: each workspace has an `issue_key` (e.g. "CAP"); issues get the
-- next number from private.issue_counters on insert, shown as CAP-12.
--
-- Security (agreed with the product owner, like Linear):
--   * read / create / edit issues, set labels, comment:
--       anyone who can see the workspace (its members + team owners/admins)
--   * delete issues, manage labels, change the workspace's issue key:
--       workspace leads + team owners/admins (private.can_manage_workspace)
--   * comments: authors edit their own; authors or managers delete
--   * created_by / author_id / team_id / number are set by the database

create type public.issue_status as enum ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled');

-- ---------------------------------------------------------------------------
-- Workspace issue key
-- ---------------------------------------------------------------------------
-- "Capstone API" → "CA", "Payments" → "PAY", anything unusable → "ISS".
create function private.issue_key_from_title(title text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  words text[] := array_remove(regexp_split_to_array(upper(coalesce(title, '')), '[^A-Z0-9]+'), '');
  key text := '';
begin
  if coalesce(array_length(words, 1), 0) = 0 then
    return 'ISS';
  elsif array_length(words, 1) = 1 then
    key := left(words[1], 3);
  else
    for i in 1 .. least(array_length(words, 1), 4) loop
      key := key || left(words[i], 1);
    end loop;
  end if;
  return case when key ~ '^[A-Z][A-Z0-9]{1,5}$' then key else 'ISS' end;
end;
$$;

alter table public.workspaces add column issue_key text;

update public.workspaces set issue_key = private.issue_key_from_title(title);

alter table public.workspaces
  alter column issue_key set not null,
  add constraint workspaces_issue_key_format check (issue_key ~ '^[A-Z][A-Z0-9]{1,5}$');

comment on column public.workspaces.issue_key is 'Issue identifier prefix, e.g. CAP in CAP-12. Editable by workspace managers.';

create function private.set_workspace_issue_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.issue_key := coalesce(new.issue_key, private.issue_key_from_title(new.title));
  return new;
end;
$$;

create trigger set_issue_key
  before insert on public.workspaces
  for each row execute function private.set_workspace_issue_key();

-- Managers may rename the key (the workspaces UPDATE policy already limits
-- updates to leads + team owners/admins).
grant update (issue_key) on table public.workspaces to authenticated;

-- ---------------------------------------------------------------------------
-- issues
-- ---------------------------------------------------------------------------
create table public.issues (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null,
  workspace_id uuid not null,
  number       integer not null,
  title        text not null,
  description  jsonb,
  status       public.issue_status not null default 'todo',
  -- Linear's scale: 0 none, 1 urgent, 2 high, 3 medium, 4 low.
  priority     smallint not null default 0,
  assignee_id  uuid references public.profiles (id) on delete set null,
  parent_id    uuid references public.issues (id) on delete set null,
  estimate     smallint,
  due_date     date,
  completed_at timestamptz,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint issues_title_length check (char_length(btrim(title)) between 1 and 300),
  constraint issues_description_size check (description is null or octet_length(description::text) <= 1000000),
  constraint issues_priority_range check (priority between 0 and 4),
  constraint issues_estimate_range check (estimate is null or estimate between 0 and 100),
  constraint issues_number_unique unique (workspace_id, number),
  -- Lets labels and comments reference (issue, workspace) so they can't cross workspaces.
  constraint issues_id_workspace_key unique (id, workspace_id),
  constraint issues_workspace_team_fkey foreign key (workspace_id, team_id)
    references public.workspaces (id, team_id) on delete cascade
);

comment on table public.issues is 'Linear-style issues in a workspace. Identifier = workspaces.issue_key || ''-'' || number.';
comment on column public.issues.description is 'Rich description (TipTap/ProseMirror JSON), same format as documents.body.';

create index issues_workspace_status_idx on public.issues (workspace_id, status);
create index issues_assignee_idx on public.issues (assignee_id);
create index issues_parent_idx on public.issues (parent_id);
create index issues_created_by_idx on public.issues (created_by);

create trigger set_updated_at
  before update on public.issues
  for each row execute function public.set_updated_at();

-- Last issue number per workspace. Private: only the trigger below touches it
-- (a separate table so numbering doesn't bump workspaces.updated_at).
create table private.issue_counters (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  last_number  integer not null
);
revoke all on table private.issue_counters from public, anon, authenticated;

-- On insert: team_id comes from the workspace and the number from its counter
-- (the upsert's row lock serializes concurrent inserts). RLS WITH CHECK runs
-- after this trigger, so a refused insert rolls the counter back too.
create function private.number_new_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select w.team_id into new.team_id from public.workspaces w where w.id = new.workspace_id;
  if new.team_id is null then
    raise exception 'Workspace not found' using errcode = '23503';
  end if;
  insert into private.issue_counters as c (workspace_id, last_number)
  values (new.workspace_id, 1)
  on conflict (workspace_id) do update set last_number = c.last_number + 1
  returning c.last_number into new.number;
  return new;
end;
$$;

create trigger number_new_issue
  before insert on public.issues
  for each row execute function private.number_new_issue();

-- On insert/update: the assignee must be in the workspace; the parent must be
-- in the same workspace and not create a loop; completed_at follows status.
create function private.check_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (
       select 1 from public.workspace_members m
       where m.workspace_id = new.workspace_id and m.user_id = new.assignee_id
     ) then
    raise exception 'The assignee must be a member of this workspace' using errcode = '23514';
  end if;

  if new.parent_id is not null
     and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    if new.parent_id = new.id then
      raise exception 'An issue can''t be its own parent' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.issues p
      where p.id = new.parent_id and p.workspace_id = new.workspace_id
    ) then
      raise exception 'The parent issue must be in the same workspace' using errcode = '23514';
    end if;
    if exists (
      with recursive up as (
        select p.id, p.parent_id, 1 as depth from public.issues p where p.id = new.parent_id
        union all
        select p.id, p.parent_id, up.depth + 1
        from public.issues p join up on p.id = up.parent_id
        where up.depth < 100
      )
      select 1 from up where up.id = new.id
    ) then
      raise exception 'That would make an issue a sub-issue of itself' using errcode = '23514';
    end if;
  end if;

  if new.status in ('done', 'canceled') then
    if tg_op = 'INSERT' or old.status not in ('done', 'canceled') then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger check_issue
  before insert or update on public.issues
  for each row execute function private.check_issue();

-- ---------------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------------
create table public.issue_labels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  color        text not null default 'default',
  created_at   timestamptz not null default now(),

  constraint issue_labels_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint issue_labels_color check (color in ('default', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'violet')),
  constraint issue_labels_id_workspace_key unique (id, workspace_id)
);

create unique index issue_labels_name_idx on public.issue_labels (workspace_id, lower(btrim(name)));

create table public.issue_label_links (
  issue_id     uuid not null,
  label_id     uuid not null,
  workspace_id uuid not null,
  primary key (issue_id, label_id),
  -- Both sides must be in the same workspace.
  constraint issue_label_links_issue_fkey foreign key (issue_id, workspace_id)
    references public.issues (id, workspace_id) on delete cascade,
  constraint issue_label_links_label_fkey foreign key (label_id, workspace_id)
    references public.issue_labels (id, workspace_id) on delete cascade
);

create index issue_label_links_label_idx on public.issue_label_links (label_id);

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create table public.issue_comments (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid not null,
  workspace_id uuid not null,
  body         text not null,
  author_id    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint issue_comments_body_length check (char_length(btrim(body)) between 1 and 10000),
  constraint issue_comments_issue_fkey foreign key (issue_id, workspace_id)
    references public.issues (id, workspace_id) on delete cascade
);

create index issue_comments_issue_idx on public.issue_comments (issue_id, created_at);
create index issue_comments_author_idx on public.issue_comments (author_id);

create trigger set_updated_at
  before update on public.issue_comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- set_issue_labels: replace an issue's labels in one transaction.
-- security invoker, so RLS applies to every row it touches.
-- ---------------------------------------------------------------------------
create function public.set_issue_labels(p_issue_id uuid, p_label_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ws uuid;
begin
  select i.workspace_id into ws from public.issues i where i.id = p_issue_id;
  if ws is null then
    raise exception 'Issue not found' using errcode = '42501';
  end if;
  delete from public.issue_label_links l
  where l.issue_id = p_issue_id and l.label_id <> all (coalesce(p_label_ids, '{}'));
  insert into public.issue_label_links (issue_id, label_id, workspace_id)
  select p_issue_id, x, ws from unnest(coalesce(p_label_ids, '{}')) as x
  on conflict do nothing;
end;
$$;

revoke all on function public.set_issue_labels(uuid, uuid[]) from public, anon;
grant execute on function public.set_issue_labels(uuid, uuid[]) to authenticated;

revoke all on function
  private.issue_key_from_title(text),
  private.set_workspace_issue_key(),
  private.number_new_issue(),
  private.check_issue()
from public, anon, authenticated;
-- The workspaces insert trigger runs as the caller (e.g. inside create_workspace).
grant execute on function private.issue_key_from_title(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on table public.issues, public.issue_labels, public.issue_label_links, public.issue_comments
  from anon, authenticated;

grant select, delete on table public.issues to authenticated;
grant insert (workspace_id, title, description, status, priority, assignee_id, parent_id, estimate, due_date)
  on table public.issues to authenticated;
grant update (title, description, status, priority, assignee_id, parent_id, estimate, due_date)
  on table public.issues to authenticated;

grant select, delete on table public.issue_labels to authenticated;
grant insert (workspace_id, name, color), update (name, color) on table public.issue_labels to authenticated;

grant select, delete on table public.issue_label_links to authenticated;
grant insert (issue_id, label_id, workspace_id) on table public.issue_label_links to authenticated;

grant select, delete on table public.issue_comments to authenticated;
grant insert (issue_id, workspace_id, body), update (body) on table public.issue_comments to authenticated;

alter table public.issues enable row level security;
alter table public.issue_labels enable row level security;
alter table public.issue_label_links enable row level security;
alter table public.issue_comments enable row level security;

-- issues
create policy "Workspace viewers can see issues"
  on public.issues for select to authenticated
  using (private.can_view_workspace(workspace_id));

create policy "Workspace viewers can create issues"
  on public.issues for insert to authenticated
  with check (private.can_view_workspace(workspace_id));

create policy "Workspace viewers can edit issues"
  on public.issues for update to authenticated
  using (private.can_view_workspace(workspace_id))
  with check (private.can_view_workspace(workspace_id));

create policy "Workspace managers can delete issues"
  on public.issues for delete to authenticated
  using (private.can_manage_workspace(workspace_id));

-- labels
create policy "Workspace viewers can see labels"
  on public.issue_labels for select to authenticated
  using (private.can_view_workspace(workspace_id));

create policy "Workspace managers can create labels"
  on public.issue_labels for insert to authenticated
  with check (private.can_manage_workspace(workspace_id));

create policy "Workspace managers can edit labels"
  on public.issue_labels for update to authenticated
  using (private.can_manage_workspace(workspace_id))
  with check (private.can_manage_workspace(workspace_id));

create policy "Workspace managers can delete labels"
  on public.issue_labels for delete to authenticated
  using (private.can_manage_workspace(workspace_id));

-- label links (labelling an issue is part of editing it)
create policy "Workspace viewers can see issue labels"
  on public.issue_label_links for select to authenticated
  using (private.can_view_workspace(workspace_id));

create policy "Workspace viewers can label issues"
  on public.issue_label_links for insert to authenticated
  with check (private.can_view_workspace(workspace_id));

create policy "Workspace viewers can unlabel issues"
  on public.issue_label_links for delete to authenticated
  using (private.can_view_workspace(workspace_id));

-- comments
create policy "Workspace viewers can see comments"
  on public.issue_comments for select to authenticated
  using (private.can_view_workspace(workspace_id));

create policy "Workspace viewers can comment"
  on public.issue_comments for insert to authenticated
  with check (private.can_view_workspace(workspace_id));

create policy "Authors can edit their comments"
  on public.issue_comments for update to authenticated
  using (author_id = (select auth.uid()) and private.can_view_workspace(workspace_id))
  with check (author_id = (select auth.uid()) and private.can_view_workspace(workspace_id));

create policy "Authors and workspace managers can delete comments"
  on public.issue_comments for delete to authenticated
  using (
    (author_id = (select auth.uid()) and private.can_view_workspace(workspace_id))
    or private.can_manage_workspace(workspace_id)
  );
