-- Group membership history visibility is explicit and enforced by message RLS.
alter table public.conversation_members
  add column history_from timestamptz;

create index conversation_members_history_idx
  on public.conversation_members (conversation_id, history_from, joined_at)
  where left_at is null;

create or replace function private.can_read_message(p_message_id uuid, p_conversation_id uuid, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        (c.kind = 'channel' and private.is_team_member(c.team_id))
        or exists (
          select 1
          from public.conversation_members cm
          where cm.conversation_id = c.id
            and cm.user_id = (select auth.uid())
            and cm.left_at is null
            and (cm.history_from is null or p_created_at >= cm.history_from)
        )
      )
  )
  and exists (select 1 from public.messages m where m.id = p_message_id and m.conversation_id = p_conversation_id);
$$;

revoke all on function private.can_read_message(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.can_read_message(uuid, uuid, timestamptz) to authenticated;

drop policy "Members can read messages" on public.messages;
create policy "Members can read messages"
  on public.messages for select to authenticated
  using (private.can_read_message(id, conversation_id, created_at));

create or replace function public.find_existing_group(p_team_id uuid, p_user_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_id uuid;
  wanted_count integer;
begin
  select count(distinct user_id)::integer into wanted_count from unnest(p_user_ids) as ids(user_id);
  if wanted_count < 2 or not private.is_team_member(p_team_id) then
    raise exception 'Invalid group participants' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(p_user_ids) as ids(user_id)
    where not exists (select 1 from public.team_members tm where tm.team_id = p_team_id and tm.user_id = ids.user_id)
  ) then
    raise exception 'All participants must belong to the group' using errcode = '42501';
  end if;
  select c.id into group_id
  from public.conversations c
  join public.conversation_members cm on cm.conversation_id = c.id and cm.left_at is null
  where c.team_id = p_team_id and c.kind = 'group'
  group by c.id
  having count(*) = wanted_count
     and count(*) filter (where cm.user_id = any(p_user_ids)) = wanted_count
  limit 1;
  return group_id;
end;
$$;

create or replace function public.add_group_member(
  p_conversation_id uuid,
  p_user_id uuid,
  p_history text
)
returns uuid
language plpgsql
security definer
set search_path = ''
 as $$
declare
  team_id uuid;
  history_from timestamptz;
  member_id uuid;
begin
  select c.team_id into team_id
  from public.conversations c
  where c.id = p_conversation_id and c.kind = 'group';
  if team_id is null or not private.can_manage_conversation(p_conversation_id) then
    raise exception 'Only the group owner can add members' using errcode = '42501';
  end if;
  if not exists (select 1 from public.team_members tm where tm.team_id = team_id and tm.user_id = p_user_id) then
    raise exception 'The person must belong to this group' using errcode = '42501';
  end if;
  if p_history = 'all' then
    history_from := null;
  elsif p_history = 'today' then
    history_from := date_trunc('day', now());
  elsif p_history = 'after' then
    history_from := now();
  else
    raise exception 'Choose a valid history option' using errcode = '22023';
  end if;
  insert into public.conversation_members (conversation_id, team_id, user_id, role, history_from, left_at)
  values (p_conversation_id, team_id, p_user_id, 'member', history_from, null)
  on conflict (conversation_id, user_id) do update
    set history_from = excluded.history_from, left_at = null
  returning user_id into member_id;
  return member_id;
end;
$$;

revoke all on function public.find_existing_group(uuid, uuid[]) from public, anon;
grant execute on function public.find_existing_group(uuid, uuid[]) to authenticated;
revoke all on function public.add_group_member(uuid, uuid, text) from public, anon;
grant execute on function public.add_group_member(uuid, uuid, text) to authenticated;
