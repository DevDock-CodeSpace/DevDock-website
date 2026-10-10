-- Who can see a workspace, and collections.
--
-- A workspace was visible only to the people added to it (and group owners/admins). It now has an
-- `access` setting:
--   members     the people added to it (the behaviour until now, and the default for every existing row)
--   collection  those people, plus everyone in the workspace's collection
--   group       those people, plus everyone in the group
-- Someone who gets in through `collection` or `group` has ordinary member rights; leads are still
-- explicit rows in workspace_members.
--
-- A collection is an optional set of workspaces inside a group with its own people and a type
-- ("Learning", "Development"). It is never required and never part of a URL.
--
-- Additive: the deployed app keeps working. Every policy, Storage rule and Edge Function decides
-- access through private.workspace_role(), so they follow the new setting without being touched.

create type public.workspace_access as enum ('members', 'collection', 'group');

-- ---------------------------------------------------------------------------------------------------
-- Collections

create table public.workspace_collections (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  name       text not null,
  type       public.team_type not null default 'general',
  position   integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_collections_id_team_key unique (id, team_id),
  constraint workspace_collections_name_length check (char_length(name) between 1 and 80)
);

comment on table public.workspace_collections is 'An optional set of workspaces inside a team, with its own people and a type.';

create unique index workspace_collections_team_name_idx on public.workspace_collections (team_id, lower(name));

create trigger set_updated_at before update on public.workspace_collections
  for each row execute function public.set_updated_at();

-- Trims the name, puts a new collection last, and caps collections per team.
create function private.prepare_workspace_collection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    if (select count(*) from public.workspace_collections c where c.team_id = new.team_id) >= 30 then
      raise exception 'A group can have at most 30 collections' using errcode = '54000';
    end if;
    select coalesce(max(c.position), -1) + 1 into new.position
    from public.workspace_collections c where c.team_id = new.team_id;
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_workspace_collection() from public, anon, authenticated;

create trigger prepare_workspace_collection before insert or update of name on public.workspace_collections
  for each row execute function private.prepare_workspace_collection();

create table public.workspace_collection_members (
  collection_id uuid not null,
  team_id       uuid not null,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, user_id),
  constraint workspace_collection_members_collection_fkey
    foreign key (collection_id, team_id) references public.workspace_collections (id, team_id) on delete cascade,
  -- Only people in the group; leaving the group leaves its collections.
  constraint workspace_collection_members_team_member_fkey
    foreign key (team_id, user_id) references public.team_members (team_id, user_id) on delete cascade
);

comment on table public.workspace_collection_members is 'The people of a collection. They must belong to the collection''s team.';
comment on column public.workspace_collection_members.team_id is 'Copied from the collection by a trigger (clients can''t set it); lets the FK require team membership.';

create index workspace_collection_members_user_idx on public.workspace_collection_members (user_id);
create index workspace_collection_members_team_user_idx on public.workspace_collection_members (team_id, user_id);

create function private.set_collection_member_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c.team_id into new.team_id
  from public.workspace_collections c
  where c.id = new.collection_id;
  -- Unknown collection → team_id stays null → not-null violation.
  return new;
end;
$$;
revoke all on function private.set_collection_member_team() from public, anon, authenticated;

create trigger set_team before insert on public.workspace_collection_members
  for each row execute function private.set_collection_member_team();

-- ---------------------------------------------------------------------------------------------------
-- Workspaces: the access setting and the collection

alter table public.workspaces
  add column access public.workspace_access not null default 'members',
  add column collection_id uuid,
  add constraint workspaces_collection_fkey
    foreign key (collection_id, team_id) references public.workspace_collections (id, team_id)
    on delete set null (collection_id),
  add constraint workspaces_collection_access check (access <> 'collection' or collection_id is not null);

comment on column public.workspaces.access is 'Who gets in besides the people added to it: nobody (members), its collection''s people, or the whole group. Changed only through set_workspace_access().';
comment on column public.workspaces.collection_id is 'The collection this workspace sits in, if any. Changed only through set_workspace_collection().';

create index workspaces_collection_idx on public.workspaces (collection_id);

-- ---------------------------------------------------------------------------------------------------
-- Access helpers

-- The caller's role in a workspace. People who get in through the workspace's access setting, without
-- a row of their own, are ordinary members.
create or replace function private.workspace_role(w uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.role
     from public.workspace_members m
     where m.workspace_id = w and m.user_id = (select auth.uid())),
    (select 'member'::public.workspace_role
     from public.workspaces ws
     where ws.id = w
       and (
         (ws.access = 'group' and exists (
            select 1 from public.team_members tm
            where tm.team_id = ws.team_id and tm.user_id = (select auth.uid())))
         or (ws.access = 'collection' and exists (
            select 1 from public.workspace_collection_members cm
            where cm.collection_id = ws.collection_id and cm.user_id = (select auth.uid())))
       ))
  );
$$;

-- Whether another person is in a workspace: added to it, or let in by its access setting.
create function private.has_workspace_access(w uuid, u uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.workspace_members m
           where m.workspace_id = w and m.user_id = u)
      or exists (
           select 1
           from public.workspaces ws
           where ws.id = w
             and (
               (ws.access = 'group' and exists (
                  select 1 from public.team_members tm
                  where tm.team_id = ws.team_id and tm.user_id = u))
               or (ws.access = 'collection' and exists (
                  select 1 from public.workspace_collection_members cm
                  where cm.collection_id = ws.collection_id and cm.user_id = u))
             ));
$$;
revoke all on function private.has_workspace_access(uuid, uuid) from public, anon;
grant execute on function private.has_workspace_access(uuid, uuid) to authenticated;

-- Everyone in a workspace, with their role, how they got in and their profile, in one call. Callers
-- must be able to see the workspace (everyone listed is in their group, whose profiles they can read).
-- `via` is 'member' for people added to it, else the access setting that lets them in.
create function public.workspace_people(p_workspace_id uuid)
returns table (
  user_id uuid,
  role public.workspace_role,
  via text,
  joined_at timestamptz,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  with people as (
    select m.user_id, m.role, 'member'::text as via, m.joined_at
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
    union all
    select tm.user_id, 'member'::public.workspace_role, 'group'::text, tm.joined_at
    from public.workspaces ws
    join public.team_members tm on tm.team_id = ws.team_id
    where ws.id = p_workspace_id
      and ws.access = 'group'
      and not exists (
        select 1 from public.workspace_members m
        where m.workspace_id = ws.id and m.user_id = tm.user_id)
    union all
    select cm.user_id, 'member'::public.workspace_role, 'collection'::text, cm.added_at
    from public.workspaces ws
    join public.workspace_collection_members cm on cm.collection_id = ws.collection_id
    where ws.id = p_workspace_id
      and ws.access = 'collection'
      and not exists (
        select 1 from public.workspace_members m
        where m.workspace_id = ws.id and m.user_id = cm.user_id)
  )
  select people.user_id, people.role, people.via, people.joined_at, p.display_name, p.avatar_url
  from people
  left join public.profiles p on p.id = people.user_id
  where private.can_view_workspace(p_workspace_id)
  order by people.joined_at, people.user_id;
$$;
revoke all on function public.workspace_people(uuid) from public, anon;
grant execute on function public.workspace_people(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- The three functions that looked up another person in workspace_members directly

-- Same as before, except the assignee may be anyone who is in the workspace (has_workspace_access).
create or replace function private.check_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not private.has_workspace_access(new.workspace_id, new.assignee_id) then
    raise exception 'The assignee must be a member of this workspace' using errcode = '23514';
  end if;

  if new.cycle_id is not null
     and (tg_op = 'INSERT' or new.cycle_id is distinct from old.cycle_id)
     and not exists (
       select 1 from public.issue_cycles c
       where c.id = new.cycle_id and c.workspace_id = new.workspace_id
     ) then
    raise exception 'The cycle must be in the same workspace' using errcode = '23514';
  end if;

  if new.repo_id is not null
     and (tg_op = 'INSERT' or new.repo_id is distinct from old.repo_id)
     and not exists (
       select 1 from public.workspace_repos r
       where r.repo_id = new.repo_id and r.workspace_id = new.workspace_id
     ) then
    raise exception 'The repository must be linked to this workspace' using errcode = '23514';
  end if;

  -- In Review / Done on a connected repo: GitHub or a workspace manager only.
  if new.status in ('in_review', 'done')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and new.repo_id is not null
     and coalesce(current_setting('devdock.via', true), '') <> 'github'
     and exists (select 1 from public.repos r where r.id = new.repo_id and r.installation_id is not null)
     and not private.can_manage_workspace(new.workspace_id) then
    raise exception 'In Review and Done are set by GitHub for this issue' using errcode = 'DD001';
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

create or replace function public.live_session_invitees(p_session_id uuid)
returns table (email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_session_id;
  if not found or not private.can_write_document(s.team_id, s.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select distinct u.email::text
    from auth.users u
    where u.id <> (select auth.uid())
      and u.email is not null
      and (
        (s.workspace_id is null and exists (
          select 1 from public.team_members m where m.team_id = s.team_id and m.user_id = u.id))
        or (s.workspace_id is not null and private.has_workspace_access(s.workspace_id, u.id))
      );
end;
$$;

create or replace function public.set_live_session_rsvps(p_session_id uuid, p_responses jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.live_sessions;
  v_count integer;
begin
  select * into v_session from public.live_sessions where id = p_session_id;
  if not found or not private.can_write_document(v_session.team_id, v_session.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_responses) <> 'array' or jsonb_array_length(p_responses) > 500 then
    raise exception 'Bad replies' using errcode = '22023';
  end if;

  with replies as (
    select lower(btrim(r.value ->> 'email')) as email, r.value ->> 'status' as status
    from jsonb_array_elements(p_responses) as r
    where r.value ->> 'status' in ('accepted', 'declined', 'tentative', 'needsAction')
  ),
  resolved as (
    -- Only people the meeting is actually for; the email is dropped here.
    select distinct on (u.id) u.id as user_id, replies.status
    from replies
    join auth.users u on lower(u.email) = replies.email
    where (
      v_session.workspace_id is null and exists (
        select 1 from public.team_members m where m.team_id = v_session.team_id and m.user_id = u.id)
    ) or (
      v_session.workspace_id is not null and private.has_workspace_access(v_session.workspace_id, u.id)
    )
  ),
  cleared as (
    delete from public.live_session_rsvps
    where session_id = p_session_id and user_id not in (select user_id from resolved)
    returning 1
  ),
  saved as (
    insert into public.live_session_rsvps (session_id, user_id, status, updated_at)
    select p_session_id, resolved.user_id, resolved.status, now() from resolved
    on conflict (session_id, user_id)
      do update set status = excluded.status, updated_at = excluded.updated_at
    returning 1
  )
  select count(*) into v_count from saved;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Changing access and collection (group owners and admins only)

-- Gives the people of a workspace's collection a row of their own, so nothing changes for them when
-- the workspace stops being open to the collection.
create function private.keep_collection_people(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.workspace_members (workspace_id, user_id, role)
  select ws.id, cm.user_id, 'member'
  from public.workspaces ws
  join public.workspace_collection_members cm on cm.collection_id = ws.collection_id
  where ws.id = p_workspace_id and ws.access = 'collection'
  on conflict do nothing;
$$;
revoke all on function private.keep_collection_people(uuid) from public, anon, authenticated;

-- Opening a workspace also admits everyone who joins the group or the collection later, so only
-- owners and admins may change it. Narrowing it removes access for people without a row of their own.
create function public.set_workspace_access(p_workspace_id uuid, p_access public.workspace_access)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.workspaces;
begin
  select * into v_workspace from public.workspaces where id = p_workspace_id;
  if not found or not private.is_team_admin(v_workspace.team_id) then
    raise exception 'Only group owners and admins can change who sees this' using errcode = '42501';
  end if;
  if p_access = 'collection' and v_workspace.collection_id is null then
    raise exception 'Put it in a collection first' using errcode = '23514';
  end if;
  update public.workspaces set access = p_access where id = p_workspace_id and access is distinct from p_access;
end;
$$;
revoke all on function public.set_workspace_access(uuid, public.workspace_access) from public, anon;
grant execute on function public.set_workspace_access(uuid, public.workspace_access) to authenticated;

-- Moves a workspace into a collection, to another one, or (null) out of any. Moving never changes who
-- can see it: a workspace that was open to its old collection keeps those people as members.
create function public.set_workspace_collection(p_workspace_id uuid, p_collection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.workspaces;
begin
  select * into v_workspace from public.workspaces where id = p_workspace_id;
  if not found or not private.is_team_admin(v_workspace.team_id) then
    raise exception 'Only group owners and admins can move this' using errcode = '42501';
  end if;
  if p_collection_id is not null and not exists (
       select 1 from public.workspace_collections c
       where c.id = p_collection_id and c.team_id = v_workspace.team_id) then
    raise exception 'Collection not found' using errcode = '23503';
  end if;
  if v_workspace.collection_id is not distinct from p_collection_id then
    return;
  end if;
  if v_workspace.access = 'collection' then
    perform private.keep_collection_people(p_workspace_id);
  end if;
  update public.workspaces
  set collection_id = p_collection_id,
      access = case when access = 'collection' then 'members'::public.workspace_access else access end
  where id = p_workspace_id;
end;
$$;
revoke all on function public.set_workspace_collection(uuid, uuid) from public, anon;
grant execute on function public.set_workspace_collection(uuid, uuid) to authenticated;

-- create_workspace() keeps its arguments (open tabs still call it). This one also places the new
-- workspace and sets who sees it, in the same transaction.
create function public.create_workspace_in(
  p_team_id uuid,
  p_title text,
  p_description text,
  p_type public.workspace_type,
  p_modules public.workspace_module[],
  p_access public.workspace_access,
  p_collection_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  new_id := public.create_workspace(p_team_id, p_title, p_description, p_type, p_modules);
  if p_collection_id is not null then
    perform public.set_workspace_collection(new_id, p_collection_id);
  end if;
  if coalesce(p_access, 'members') <> 'members' then
    perform public.set_workspace_access(new_id, p_access);
  end if;
  return new_id;
end;
$$;
revoke all on function public.create_workspace_in(uuid, text, text, public.workspace_type, public.workspace_module[], public.workspace_access, uuid) from public, anon;
grant execute on function public.create_workspace_in(uuid, text, text, public.workspace_type, public.workspace_module[], public.workspace_access, uuid) to authenticated;

-- Deleting a collection returns its workspaces to the top level. The ones open to it keep its people
-- as members, so nobody loses access silently.
create function private.release_collection_workspaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  -- The whole group is being deleted: its workspaces go with it.
  if not exists (select 1 from public.teams t where t.id = old.team_id) then
    return old;
  end if;
  for v_workspace_id in
    select ws.id from public.workspaces ws where ws.collection_id = old.id and ws.access = 'collection'
  loop
    perform private.keep_collection_people(v_workspace_id);
  end loop;
  update public.workspaces
  set collection_id = null,
      access = case when access = 'collection' then 'members'::public.workspace_access else access end
  where collection_id = old.id;
  return old;
end;
$$;
revoke all on function private.release_collection_workspaces() from public, anon, authenticated;

create trigger release_workspaces before delete on public.workspace_collections
  for each row execute function private.release_collection_workspaces();

-- ---------------------------------------------------------------------------------------------------
-- Grants and RLS

revoke all on table public.workspace_collections from anon, authenticated;
grant select, delete on table public.workspace_collections to authenticated;
grant insert (team_id, name, type) on table public.workspace_collections to authenticated;
grant update (name, type, position) on table public.workspace_collections to authenticated;

alter table public.workspace_collections enable row level security;

-- The group's member list is already visible to everyone in it; collections only group that list.
create policy "Group members see the group's collections"
  on public.workspace_collections for select to authenticated
  using (private.is_team_member(team_id));

create policy "Owners and admins create collections"
  on public.workspace_collections for insert to authenticated
  with check (private.is_team_admin(team_id) and created_by = (select auth.uid()));

create policy "Owners and admins edit collections"
  on public.workspace_collections for update to authenticated
  using (private.is_team_admin(team_id))
  with check (private.is_team_admin(team_id));

create policy "Owners and admins delete collections"
  on public.workspace_collections for delete to authenticated
  using (private.is_team_admin(team_id));

revoke all on table public.workspace_collection_members from anon, authenticated;
grant select, delete on table public.workspace_collection_members to authenticated;
grant insert (collection_id, user_id) on table public.workspace_collection_members to authenticated;

alter table public.workspace_collection_members enable row level security;

create policy "Group members see who is in a collection"
  on public.workspace_collection_members for select to authenticated
  using (private.is_team_member(team_id));

create policy "Owners and admins add people to collections"
  on public.workspace_collection_members for insert to authenticated
  with check (private.is_team_admin(team_id));

create policy "Owners and admins remove people from collections"
  on public.workspace_collection_members for delete to authenticated
  using (private.is_team_admin(team_id));

-- ---------------------------------------------------------------------------------------------------
-- Doc images follow their doc
--
-- An image path is <team>/<doc>/<file>. Access was decided by the doc *and* required the path's team
-- to be the doc's team, which would orphan a doc's images if its workspace ever moved to another
-- group. The doc id alone identifies the doc, and access is still decided by where the doc is now.

create or replace function private.can_access_doc_image(object_name text, for_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = private.to_uuid((storage.foldername(object_name))[2])
      and case
        when for_write then private.can_write_document(d.team_id, d.workspace_id)
        else private.can_read_document(d.team_id, d.workspace_id)
      end
  );
$$;

create or replace function private.can_upload_doc_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = private.to_uuid((storage.foldername(object_name))[2])
      and private.can_edit_document(d.team_id, d.workspace_id)
  );
$$;

-- ---------------------------------------------------------------------------------------------------
-- Live updates

do $$
declare
  t text;
begin
  foreach t in array array['workspace_collections', 'workspace_collection_members'] loop
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
