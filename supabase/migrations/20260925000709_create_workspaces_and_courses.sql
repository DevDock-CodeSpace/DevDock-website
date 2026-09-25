-- Role model: workspaces → courses, with per-workspace and per-course roles.
--
--   workspaces          a tenant (e.g. one teaching group)
--   workspace_members   user ↔ workspace, role: owner | admin | member
--   courses             belong to exactly one workspace
--   course_members      user ↔ course, role: lead | member
--
-- Roles live only in the membership tables (never in profiles), so a user can
-- hold different roles in different workspaces and courses.
--
-- Invariants enforced by the database:
--   * every workspace has exactly one owner
--       - at most one: partial unique index on (workspace_id) where role = 'owner'
--       - at least one: deferred constraint triggers, checked at commit
--   * creating a workspace makes its creator the owner (trigger)
--   * a course member must already be a member of the course's workspace
--     (composite foreign key; removing someone from a workspace removes them
--     from its courses)
--
-- Authorization (RLS):
--   * workspace owner/admin: see and manage every course in the workspace
--   * course lead: manage their own course and its (non-lead) members
--   * workspace member: see the workspace and fellow members, and only the
--     courses they are assigned to
--   * nobody can grant themselves a role or add themselves to a workspace/course

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.workspace_role as enum ('owner', 'admin', 'member');
create type public.course_role as enum ('lead', 'member');

-- ---------------------------------------------------------------------------
-- Private schema for RLS helpers and trigger functions. It is not exposed by
-- the Data API, so none of these can be called as RPCs.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null,
  -- Always the caller: clients have no INSERT privilege on this column.
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workspaces_slug_key unique (slug),
  constraint workspaces_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint workspaces_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 48)
);

comment on table public.workspaces is 'Top-level tenant. Its creator becomes the owner.';

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- References profiles (not auth.users) so the API can embed names/avatars.
  -- profiles.id cascades from auth.users, so account deletion still cascades.
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.workspace_role not null default 'member',
  joined_at    timestamptz not null default now(),

  primary key (workspace_id, user_id)
);

comment on table public.workspace_members is 'Workspace membership and role. Exactly one owner per workspace.';

create index workspace_members_user_id_idx on public.workspace_members (user_id);
create unique index workspace_members_one_owner_idx
  on public.workspace_members (workspace_id)
  where role = 'owner';

create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title        text not null,
  description  text,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Target for course_members' composite foreign key.
  constraint courses_id_workspace_key unique (id, workspace_id),
  constraint courses_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint courses_description_length
    check (description is null or char_length(description) <= 5000)
);

comment on table public.courses is 'A course inside a workspace.';

create index courses_workspace_id_idx on public.courses (workspace_id);

create table public.course_members (
  course_id    uuid not null,
  -- Copied from the course by a trigger (clients can't set it). It exists so
  -- the foreign key below can require workspace membership.
  workspace_id uuid not null,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.course_role not null default 'member',
  joined_at    timestamptz not null default now(),

  primary key (course_id, user_id),
  foreign key (course_id, workspace_id)
    references public.courses (id, workspace_id) on delete cascade,
  -- Must be a workspace member first; leaving the workspace leaves its courses.
  foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade
);

comment on table public.course_members is 'Course membership and role. Members must belong to the course''s workspace.';

create index course_members_user_id_idx on public.course_members (user_id);
create index course_members_workspace_user_idx on public.course_members (workspace_id, user_id);

create trigger set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

create trigger set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger functions
-- ---------------------------------------------------------------------------

-- The creator of a workspace becomes its owner.
create function private.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null then
    raise exception 'workspaces.created_by is required (no authenticated user)'
      using errcode = '23502';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');

  return null;
end;
$$;

create trigger add_owner_membership
  after insert on public.workspaces
  for each row execute function private.add_workspace_owner();

-- At least one owner. Deferred to commit so ownership can be transferred inside
-- a single transaction (demote the old owner, then promote the new one).
create function private.assert_workspace_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  -- IF, not CASE: PL/pgSQL would resolve old.workspace_id even in an untaken
  -- CASE branch, and a workspaces row has no such field.
  if tg_table_name = 'workspaces' then
    ws := new.id;
  else
    ws := old.workspace_id;
  end if;

  if exists (select 1 from public.workspaces w where w.id = ws)
     and not exists (
       select 1 from public.workspace_members m
       where m.workspace_id = ws and m.role = 'owner'
     )
  then
    raise exception 'workspace % must have exactly one owner', ws
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger require_owner
  after insert on public.workspaces
  deferrable initially deferred
  for each row execute function private.assert_workspace_has_owner();

create constraint trigger keep_owner
  after update of role or delete on public.workspace_members
  deferrable initially deferred
  for each row execute function private.assert_workspace_has_owner();

-- course_members.workspace_id always comes from the course, never the client.
create function private.set_course_member_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c.workspace_id into new.workspace_id
  from public.courses c
  where c.id = new.course_id;
  -- Unknown course → workspace_id stays null → not-null violation.
  return new;
end;
$$;

create trigger set_workspace
  before insert on public.course_members
  for each row execute function private.set_course_member_workspace();

-- ---------------------------------------------------------------------------
-- RLS helpers. security definer so policies can read membership tables
-- without recursing into their own RLS. They only answer questions about the
-- calling user (auth.uid()).
-- ---------------------------------------------------------------------------
create function private.workspace_role(ws uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = ws and m.user_id = (select auth.uid());
$$;

create function private.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.workspace_role(ws) is not null;
$$;

create function private.is_workspace_admin(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.workspace_role(ws) in ('owner', 'admin'), false);
$$;

create function private.course_role(c uuid)
returns public.course_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.course_members m
  where m.course_id = c and m.user_id = (select auth.uid());
$$;

-- Workspace owner/admin, or lead of this course.
create function private.can_manage_course(c uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.course_role(c) = 'lead', false)
      or private.is_workspace_admin(
           (select co.workspace_id from public.courses co where co.id = c)
         );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.workspace_role(uuid),
  private.is_workspace_member(uuid),
  private.is_workspace_admin(uuid),
  private.course_role(uuid),
  private.can_manage_course(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, grant only what the policies below need.
-- Column lists keep ids, created_by, workspace_id and timestamps server-owned.
-- ---------------------------------------------------------------------------
revoke all on table
  public.workspaces, public.workspace_members, public.courses, public.course_members
from anon, authenticated;

grant select, delete on table public.workspaces to authenticated;
grant insert (name, slug), update (name, slug) on table public.workspaces to authenticated;

grant select, delete on table public.workspace_members to authenticated;
grant insert (workspace_id, user_id, role), update (role) on table public.workspace_members to authenticated;

grant select, delete on table public.courses to authenticated;
grant insert (workspace_id, title, description), update (title, description)
  on table public.courses to authenticated;

grant select, delete on table public.course_members to authenticated;
grant insert (course_id, user_id, role), update (role) on table public.course_members to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.courses enable row level security;
alter table public.course_members enable row level security;

-- workspaces ----------------------------------------------------------------

-- created_by clause: the creator must be able to read the row back in the same
-- INSERT … RETURNING, before the owner-membership trigger has run.
create policy "Members can view their workspaces"
  on public.workspaces for select to authenticated
  using (private.is_workspace_member(id) or created_by = (select auth.uid()));

create policy "Signed-in users can create workspaces"
  on public.workspaces for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "Owners and admins can update the workspace"
  on public.workspaces for update to authenticated
  using (private.is_workspace_admin(id))
  with check (private.is_workspace_admin(id));

create policy "Owners can delete the workspace"
  on public.workspaces for delete to authenticated
  using (private.workspace_role(id) = 'owner');

-- workspace_members -----------------------------------------------------------

create policy "Members can view fellow workspace members"
  on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Owner adds admins/members; admin adds members. Nobody inserts an owner
-- (only the creation trigger does), and non-members can't add themselves.
create policy "Owners and admins can add workspace members"
  on public.workspace_members for insert to authenticated
  with check (
    role <> 'owner'
    and (
      private.workspace_role(workspace_id) = 'owner'
      or (private.workspace_role(workspace_id) = 'admin' and role = 'member')
    )
  );

-- Only the owner changes roles, never their own, and never to 'owner'.
create policy "Owners can change other members' roles"
  on public.workspace_members for update to authenticated
  using (private.workspace_role(workspace_id) = 'owner' and user_id <> (select auth.uid()))
  with check (role <> 'owner');

-- Leave (anyone but the owner), or remove: owner removes anyone else,
-- admin removes plain members.
create policy "Members can leave; owners and admins can remove members"
  on public.workspace_members for delete to authenticated
  using (
    role <> 'owner'
    and (
      user_id = (select auth.uid())
      or private.workspace_role(workspace_id) = 'owner'
      or (private.workspace_role(workspace_id) = 'admin' and role = 'member')
    )
  );

-- courses ---------------------------------------------------------------------

create policy "Admins see all workspace courses; others see assigned courses"
  on public.courses for select to authenticated
  using (private.is_workspace_admin(workspace_id) or private.course_role(id) is not null);

create policy "Owners and admins can create courses"
  on public.courses for insert to authenticated
  with check (private.is_workspace_admin(workspace_id) and created_by = (select auth.uid()));

create policy "Owners, admins and course leads can update the course"
  on public.courses for update to authenticated
  using (private.can_manage_course(id))
  with check (private.can_manage_course(id));

create policy "Owners and admins can delete courses"
  on public.courses for delete to authenticated
  using (private.is_workspace_admin(workspace_id));

-- course_members --------------------------------------------------------------

create policy "Course members and workspace admins can view course members"
  on public.course_members for select to authenticated
  using (private.is_workspace_admin(workspace_id) or private.course_role(course_id) is not null);

-- Admins add leads or members; leads add members only.
create policy "Admins and course leads can add course members"
  on public.course_members for insert to authenticated
  with check (
    private.is_workspace_admin(workspace_id)
    or (private.course_role(course_id) = 'lead' and role = 'member')
  );

-- Only workspace owners/admins change course roles (leads can't promote).
create policy "Owners and admins can change course roles"
  on public.course_members for update to authenticated
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

create policy "Members can leave; admins and leads can remove course members"
  on public.course_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_workspace_admin(workspace_id)
    or (private.course_role(course_id) = 'lead' and role = 'member')
  );
