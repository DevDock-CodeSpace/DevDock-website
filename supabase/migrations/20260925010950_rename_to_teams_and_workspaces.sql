-- Product model change:  Workspace → Course   becomes   Team → Workspace.
--
--   workspaces         → teams             workspace_role (owner|admin|member) → team_role
--   workspace_members  → team_members      course_role    (lead|member)        → workspace_role
--   workspace_invites  → team_invites
--   courses            → workspaces        + teams.type      team_type      (development|learning|general)
--   course_members     → workspace_members + workspaces.type workspace_type (project|course|general)
--
-- Tables, columns, enums, constraints and indexes are RENAMED in place, so all
-- rows, grants and foreign keys carry over. Postgres re-points policies and
-- keys automatically, but function bodies are stored as text, so every
-- function (and the triggers and policies that depend on them) is dropped and
-- recreated with the new names. The whole migration runs in one transaction.
--
-- Security guarantees are unchanged:
--   * exactly one owner per team (partial unique index + deferred check)
--   * a team's creator becomes its owner; created_by can't be spoofed
--   * joining a team only via invite code (public.join_team), always as member
--   * workspace members must belong to the parent team (composite FK)
--   * owner/admin manage the team's workspaces; leads manage their workspace
--   * nobody can grant themselves a role
--   * profiles and auth users are untouched

-- ===========================================================================
-- 1. Drop what references old names by text: policies → triggers → functions
-- ===========================================================================
drop policy "Members can view their workspaces" on public.workspaces;
drop policy "Signed-in users can create workspaces" on public.workspaces;
drop policy "Owners and admins can update the workspace" on public.workspaces;
drop policy "Owners can delete the workspace" on public.workspaces;

drop policy "Members can view fellow workspace members" on public.workspace_members;
drop policy "Owners and admins can add workspace members" on public.workspace_members;
drop policy "Owners can change other members' roles" on public.workspace_members;
drop policy "Members can leave; owners and admins can remove members" on public.workspace_members;

drop policy "Admins see all workspace courses; others see assigned courses" on public.courses;
drop policy "Owners and admins can create courses" on public.courses;
drop policy "Owners, admins and course leads can update the course" on public.courses;
drop policy "Owners and admins can delete courses" on public.courses;

drop policy "Course members and workspace admins can view course members" on public.course_members;
drop policy "Admins and course leads can add course members" on public.course_members;
drop policy "Owners and admins can change course roles" on public.course_members;
drop policy "Members can leave; admins and leads can remove course members" on public.course_members;

drop policy "Owners and admins can view invites" on public.workspace_invites;
drop policy "Owners and admins can create invites" on public.workspace_invites;
drop policy "Owners and admins can revoke invites" on public.workspace_invites;

drop policy "Users can read profiles of workspace peers" on public.profiles;

drop trigger add_owner_membership on public.workspaces;
drop trigger require_owner on public.workspaces;
drop trigger keep_owner on public.workspace_members;
drop trigger set_workspace on public.course_members;

drop function public.join_workspace(text);
drop function private.add_workspace_owner();
drop function private.assert_workspace_has_owner();
drop function private.set_course_member_workspace();
drop function private.can_manage_course(uuid);
drop function private.course_role(uuid);
drop function private.is_workspace_admin(uuid);
drop function private.is_workspace_member(uuid);
drop function private.workspace_role(uuid);
drop function private.shares_workspace_with(uuid);

-- ===========================================================================
-- 2. Rename enums (order matters: free the name "workspace_role" first)
-- ===========================================================================
alter type public.workspace_role rename to team_role;
alter type public.course_role rename to workspace_role;

-- ===========================================================================
-- 3. Rename the old workspace-level tables → team-level (free the names first)
-- ===========================================================================
alter table public.workspaces rename to teams;
alter table public.teams rename constraint workspaces_pkey to teams_pkey;
alter table public.teams rename constraint workspaces_slug_key to teams_slug_key;
alter table public.teams rename constraint workspaces_name_length to teams_name_length;
alter table public.teams rename constraint workspaces_slug_format to teams_slug_format;
alter table public.teams rename constraint workspaces_created_by_fkey to teams_created_by_fkey;

alter table public.workspace_members rename to team_members;
alter table public.team_members rename column workspace_id to team_id;
alter table public.team_members rename constraint workspace_members_pkey to team_members_pkey;
alter table public.team_members rename constraint workspace_members_workspace_id_fkey to team_members_team_id_fkey;
alter table public.team_members rename constraint workspace_members_user_id_fkey to team_members_user_id_fkey;
alter index public.workspace_members_user_id_idx rename to team_members_user_id_idx;
alter index public.workspace_members_one_owner_idx rename to team_members_one_owner_idx;

alter table public.workspace_invites rename to team_invites;
alter table public.team_invites rename column workspace_id to team_id;
alter table public.team_invites rename constraint workspace_invites_pkey to team_invites_pkey;
alter table public.team_invites rename constraint workspace_invites_code_key to team_invites_code_key;
alter table public.team_invites rename constraint workspace_invites_code_format to team_invites_code_format;
alter table public.team_invites rename constraint workspace_invites_max_uses_positive to team_invites_max_uses_positive;
alter table public.team_invites rename constraint workspace_invites_use_count_valid to team_invites_use_count_valid;
alter table public.team_invites rename constraint workspace_invites_expiry_after_creation to team_invites_expiry_after_creation;
alter table public.team_invites rename constraint workspace_invites_created_by_fkey to team_invites_created_by_fkey;
alter table public.team_invites rename constraint workspace_invites_workspace_id_fkey to team_invites_team_id_fkey;
alter index public.workspace_invites_workspace_id_idx rename to team_invites_team_id_idx;

-- ===========================================================================
-- 4. Rename course-level tables → workspace-level
-- ===========================================================================
alter table public.courses rename to workspaces;
alter table public.workspaces rename column workspace_id to team_id;
alter table public.workspaces rename constraint courses_pkey to workspaces_pkey;
alter table public.workspaces rename constraint courses_id_workspace_key to workspaces_id_team_key;
alter table public.workspaces rename constraint courses_title_length to workspaces_title_length;
alter table public.workspaces rename constraint courses_description_length to workspaces_description_length;
alter table public.workspaces rename constraint courses_created_by_fkey to workspaces_created_by_fkey;
alter table public.workspaces rename constraint courses_workspace_id_fkey to workspaces_team_id_fkey;
alter index public.courses_workspace_id_idx rename to workspaces_team_id_idx;

alter table public.course_members rename to workspace_members;
-- Order matters: free "workspace_id" before course_id takes that name.
alter table public.workspace_members rename column workspace_id to team_id;
alter table public.workspace_members rename column course_id to workspace_id;
alter table public.workspace_members rename constraint course_members_pkey to workspace_members_pkey;
alter table public.workspace_members rename constraint course_members_user_id_fkey to workspace_members_user_id_fkey;
alter table public.workspace_members
  rename constraint course_members_course_id_workspace_id_fkey to workspace_members_workspace_id_team_id_fkey;
alter table public.workspace_members
  rename constraint course_members_workspace_id_user_id_fkey to workspace_members_team_id_user_id_fkey;
alter index public.course_members_user_id_idx rename to workspace_members_user_id_idx;
alter index public.course_members_workspace_user_idx rename to workspace_members_team_user_idx;

-- ===========================================================================
-- 5. New: team and workspace types
-- ===========================================================================
create type public.team_type as enum ('development', 'learning', 'general');
create type public.workspace_type as enum ('project', 'course', 'general');

alter table public.teams add column type public.team_type not null default 'general';
alter table public.workspaces add column type public.workspace_type not null default 'general';
-- Every existing workspace was created as a course.
update public.workspaces set type = 'course';

-- Existing column grants moved with the renames; the new columns need their own.
grant insert (type), update (type) on table public.teams to authenticated;
grant insert (type), update (type) on table public.workspaces to authenticated;

comment on table public.teams is 'Top-level group (formerly "workspace"). Its creator becomes the owner.';
comment on table public.team_members is 'Team membership and role. Exactly one owner per team.';
comment on table public.team_invites is
  'Invite codes for joining a team as a member. Redeemed only via public.join_team().';
comment on table public.workspaces is 'A workspace inside a team (formerly "course"): a project, course, or general space.';
comment on table public.workspace_members is
  'Workspace membership and role. Members must belong to the workspace''s team.';
comment on column public.workspace_members.team_id is
  'Copied from the workspace by a trigger (clients can''t set it); lets the FK require team membership.';

-- ===========================================================================
-- 6. Trigger functions + triggers
-- ===========================================================================

-- The creator of a team becomes its owner.
create function private.add_team_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null then
    raise exception 'teams.created_by is required (no authenticated user)'
      using errcode = '23502';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (new.id, new.created_by, 'owner');

  return null;
end;
$$;

create trigger add_owner_membership
  after insert on public.teams
  for each row execute function private.add_team_owner();

-- At least one owner, checked at commit (so ownership can be transferred in
-- one transaction). At most one is the partial unique index.
create function private.assert_team_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid;
begin
  -- IF, not CASE: PL/pgSQL would resolve old.team_id even in an untaken CASE
  -- branch, and a teams row has no such field.
  if tg_table_name = 'teams' then
    t := new.id;
  else
    t := old.team_id;
  end if;

  if exists (select 1 from public.teams tm where tm.id = t)
     and not exists (
       select 1 from public.team_members m
       where m.team_id = t and m.role = 'owner'
     )
  then
    raise exception 'team % must have exactly one owner', t
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger require_owner
  after insert on public.teams
  deferrable initially deferred
  for each row execute function private.assert_team_has_owner();

create constraint trigger keep_owner
  after update of role or delete on public.team_members
  deferrable initially deferred
  for each row execute function private.assert_team_has_owner();

-- workspace_members.team_id always comes from the workspace, never the client.
create function private.set_workspace_member_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select w.team_id into new.team_id
  from public.workspaces w
  where w.id = new.workspace_id;
  -- Unknown workspace → team_id stays null → not-null violation.
  return new;
end;
$$;

create trigger set_team
  before insert on public.workspace_members
  for each row execute function private.set_workspace_member_team();

-- ===========================================================================
-- 7. RLS helpers (security definer; only answer questions about the caller)
-- ===========================================================================
create function private.team_role(t uuid)
returns public.team_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.team_members m
  where m.team_id = t and m.user_id = (select auth.uid());
$$;

create function private.is_team_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.team_role(t) is not null;
$$;

create function private.is_team_admin(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.team_role(t) in ('owner', 'admin'), false);
$$;

create function private.workspace_role(w uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = w and m.user_id = (select auth.uid());
$$;

-- Team owner/admin, or lead of this workspace.
create function private.can_manage_workspace(w uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.workspace_role(w) = 'lead', false)
      or private.is_team_admin(
           (select ws.team_id from public.workspaces ws where ws.id = w)
         );
$$;

create function private.shares_team_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members mine
    join public.team_members theirs on theirs.team_id = mine.team_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user
  );
$$;

revoke all on function
  private.add_team_owner(),
  private.assert_team_has_owner(),
  private.set_workspace_member_team(),
  private.team_role(uuid),
  private.is_team_member(uuid),
  private.is_team_admin(uuid),
  private.workspace_role(uuid),
  private.can_manage_workspace(uuid),
  private.shares_team_with(uuid)
from public, anon, authenticated;

grant execute on function
  private.team_role(uuid),
  private.is_team_member(uuid),
  private.is_team_admin(uuid),
  private.workspace_role(uuid),
  private.can_manage_workspace(uuid),
  private.shares_team_with(uuid)
to authenticated;

-- ===========================================================================
-- 8. Join a team with an invite code (replaces public.join_workspace)
--    Always as 'member'; idempotent; row-locked use counting; one uniform
--    'invalid_invite' error so callers can't probe which codes exist.
-- ===========================================================================
create function public.join_team(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  digits text := upper(regexp_replace(coalesce(invite_code, ''), '[^0-9A-Za-z]', '', 'g'));
  invite public.team_invites%rowtype;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if char_length(digits) = 12 then
    select * into invite
    from public.team_invites i
    where i.code = substr(digits, 1, 4) || '-' || substr(digits, 5, 4) || '-' || substr(digits, 9, 4)
    for update;
  end if;

  if invite.id is null
     or (invite.expires_at is not null and invite.expires_at <= now())
     or (invite.max_uses is not null and invite.use_count >= invite.max_uses)
  then
    raise exception 'invalid_invite'
      using errcode = 'P0001',
            hint = 'The invite code is invalid, expired, or has no uses left.';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (invite.team_id, caller, 'member')
  on conflict (team_id, user_id) do nothing;

  if found then
    update public.team_invites
    set use_count = use_count + 1
    where id = invite.id;
  end if;

  return invite.team_id;
end;
$$;

comment on function public.join_team(text) is
  'Join a team as a member using an invite code. Returns the team id.';

revoke execute on function public.join_team(text) from public, anon;
grant execute on function public.join_team(text) to authenticated;

-- ===========================================================================
-- 9. Policies (same rules as before, new names)
-- ===========================================================================

-- teams -----------------------------------------------------------------------
-- created_by clause: the creator must read the row back in INSERT … RETURNING,
-- before the owner-membership trigger has run.
create policy "Members can view their teams"
  on public.teams for select to authenticated
  using (private.is_team_member(id) or created_by = (select auth.uid()));

create policy "Signed-in users can create teams"
  on public.teams for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "Owners and admins can update the team"
  on public.teams for update to authenticated
  using (private.is_team_admin(id))
  with check (private.is_team_admin(id));

create policy "Owners can delete the team"
  on public.teams for delete to authenticated
  using (private.team_role(id) = 'owner');

-- team_members ----------------------------------------------------------------
create policy "Members can view fellow team members"
  on public.team_members for select to authenticated
  using (private.is_team_member(team_id));

-- Owner adds admins/members; admin adds members. Nobody inserts an owner
-- (only the creation trigger does); non-members can't add themselves.
create policy "Owners and admins can add team members"
  on public.team_members for insert to authenticated
  with check (
    role <> 'owner'
    and (
      private.team_role(team_id) = 'owner'
      or (private.team_role(team_id) = 'admin' and role = 'member')
    )
  );

-- Only the owner changes roles, never their own, and never to 'owner'.
create policy "Owners can change other members' roles"
  on public.team_members for update to authenticated
  using (private.team_role(team_id) = 'owner' and user_id <> (select auth.uid()))
  with check (role <> 'owner');

create policy "Members can leave; owners and admins can remove members"
  on public.team_members for delete to authenticated
  using (
    role <> 'owner'
    and (
      user_id = (select auth.uid())
      or private.team_role(team_id) = 'owner'
      or (private.team_role(team_id) = 'admin' and role = 'member')
    )
  );

-- team_invites ----------------------------------------------------------------
create policy "Owners and admins can view invites"
  on public.team_invites for select to authenticated
  using (private.is_team_admin(team_id));

create policy "Owners and admins can create invites"
  on public.team_invites for insert to authenticated
  with check (private.is_team_admin(team_id) and created_by = (select auth.uid()));

create policy "Owners and admins can revoke invites"
  on public.team_invites for delete to authenticated
  using (private.is_team_admin(team_id));

-- workspaces ------------------------------------------------------------------
create policy "Admins see all team workspaces; others see assigned workspaces"
  on public.workspaces for select to authenticated
  using (private.is_team_admin(team_id) or private.workspace_role(id) is not null);

create policy "Owners and admins can create workspaces"
  on public.workspaces for insert to authenticated
  with check (private.is_team_admin(team_id) and created_by = (select auth.uid()));

create policy "Owners, admins and workspace leads can update the workspace"
  on public.workspaces for update to authenticated
  using (private.can_manage_workspace(id))
  with check (private.can_manage_workspace(id));

create policy "Owners and admins can delete workspaces"
  on public.workspaces for delete to authenticated
  using (private.is_team_admin(team_id));

-- workspace_members -----------------------------------------------------------
create policy "Workspace members and team admins can view workspace members"
  on public.workspace_members for select to authenticated
  using (private.is_team_admin(team_id) or private.workspace_role(workspace_id) is not null);

-- Admins add leads or members; leads add members only.
create policy "Admins and workspace leads can add workspace members"
  on public.workspace_members for insert to authenticated
  with check (
    private.is_team_admin(team_id)
    or (private.workspace_role(workspace_id) = 'lead' and role = 'member')
  );

-- Only team owners/admins change workspace roles (leads can't promote).
create policy "Owners and admins can change workspace roles"
  on public.workspace_members for update to authenticated
  using (private.is_team_admin(team_id))
  with check (private.is_team_admin(team_id));

create policy "Members can leave; admins and leads can remove members"
  on public.workspace_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_team_admin(team_id)
    or (private.workspace_role(workspace_id) = 'lead' and role = 'member')
  );

-- profiles --------------------------------------------------------------------
create policy "Users can read profiles of team peers"
  on public.profiles for select to authenticated
  using (private.shares_team_with(id));
