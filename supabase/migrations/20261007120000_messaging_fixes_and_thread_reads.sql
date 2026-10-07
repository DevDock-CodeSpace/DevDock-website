-- 1. add_group_member never worked: the variable `team_id` collided with the column of the same name
--    ("column reference team_id is ambiguous"). Same behavior, variables renamed.
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
  v_team_id uuid;
  v_history_from timestamptz;
  v_member_id uuid;
begin
  select c.team_id into v_team_id
  from public.conversations c
  where c.id = p_conversation_id and c.kind = 'group';
  if v_team_id is null or not private.can_manage_conversation(p_conversation_id) then
    raise exception 'Only the group owner can add members' using errcode = '42501';
  end if;
  if not exists (select 1 from public.team_members tm where tm.team_id = v_team_id and tm.user_id = p_user_id) then
    raise exception 'The person must belong to this group' using errcode = '42501';
  end if;
  if p_history = 'all' then
    v_history_from := null;
  elsif p_history = 'today' then
    v_history_from := date_trunc('day', now());
  elsif p_history = 'after' then
    v_history_from := now();
  else
    raise exception 'Choose a valid history option' using errcode = '22023';
  end if;
  insert into public.conversation_members (conversation_id, team_id, user_id, role, history_from, left_at)
  values (p_conversation_id, v_team_id, p_user_id, 'member', v_history_from, null)
  on conflict (conversation_id, user_id) do update
    set history_from = excluded.history_from, left_at = null
  returning user_id into v_member_id;
  return v_member_id;
end;
$$;

-- 1b. Someone removed from the team kept reading their DMs and groups: those checked conversation
--     membership only. The architecture doc says removing a team member removes access, so DM/group
--     access now also requires being in the team (channels already did).
create or replace function private.can_read_conversation(c uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c1
    where c1.id = c
      and private.is_team_member(c1.team_id)
      and (
        c1.kind = 'channel'
        or exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = c1.id and cm.user_id = (select auth.uid()) and cm.left_at is null
        )
      )
  );
$$;

create or replace function private.can_manage_conversation(c uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c1
    where c1.id = c
      and private.is_team_member(c1.team_id)
      and (
        (c1.kind = 'channel' and private.is_team_admin(c1.team_id))
        or exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = c1.id and cm.user_id = (select auth.uid()) and cm.role = 'owner' and cm.left_at is null
        )
      )
  );
$$;

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
      and private.is_team_member(c.team_id)
      and (
        c.kind = 'channel'
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

-- 2. The 5-argument send_message was superseded by the 6-argument one (mentions). The old one is still
--    callable and skips mention validation, and makes short calls ambiguous. Drop it.
drop function if exists public.send_message(uuid, uuid, jsonb, text, uuid);

-- 3. Per-thread read position. Replaces the single per-conversation thread marker for the UI.
create table public.thread_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index thread_reads_conversation_idx on public.thread_reads (conversation_id, user_id);
revoke all on table public.thread_reads from anon, authenticated;
grant select on public.thread_reads to authenticated;
alter table public.thread_reads enable row level security;
create policy "People read their own thread positions"
  on public.thread_reads for select to authenticated
  using (user_id = (select auth.uid()) and private.can_read_conversation(conversation_id));

create or replace function public.mark_thread_read(p_parent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation uuid;
begin
  select m.conversation_id into v_conversation
  from public.messages m
  where m.id = p_parent_id and m.parent_id is null
    and private.can_read_message(m.id, m.conversation_id, m.created_at);
  if v_conversation is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.thread_reads (message_id, conversation_id, user_id, last_read_at)
  values (p_parent_id, v_conversation, (select auth.uid()), now())
  on conflict (message_id, user_id) do update
    set last_read_at = greatest(public.thread_reads.last_read_at, excluded.last_read_at);
end;
$$;

-- Threads you take part in (you wrote the original, replied, or opened it) and how many replies from
-- other people arrived since you last looked (or last wrote there).
create or replace function public.thread_unread_counts(p_conversation_id uuid)
returns table (parent_id uuid, unread_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  threads as (
    select p.id as parent_id,
           coalesce(
             tr.last_read_at,
             (select max(x.created_at) from public.messages x
               where (x.id = p.id or x.parent_id = p.id) and x.author_id = (select id from me))
           ) as since,
           (tr.message_id is not null
             or p.author_id = (select id from me)
             or exists (select 1 from public.messages x where x.parent_id = p.id and x.author_id = (select id from me))) as takes_part
      from public.messages p
      left join public.thread_reads tr on tr.message_id = p.id and tr.user_id = (select id from me)
     where p.conversation_id = p_conversation_id
       and p.parent_id is null
       and private.can_read_conversation(p_conversation_id)
  )
  select t.parent_id, count(r.id)::integer
    from threads t
    join public.messages r
      on r.parent_id = t.parent_id
     and r.deleted_at is null
     and r.author_id <> (select id from me)
     and r.created_at > coalesce(t.since, '-infinity'::timestamptz)
     and private.can_read_message(r.id, r.conversation_id, r.created_at)
   where t.takes_part
   group by t.parent_id;
$$;

revoke all on function public.add_group_member(uuid, uuid, text), public.mark_thread_read(uuid), public.thread_unread_counts(uuid) from public, anon;
grant execute on function public.add_group_member(uuid, uuid, text), public.mark_thread_read(uuid), public.thread_unread_counts(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'thread_reads') then
    alter publication supabase_realtime add table public.thread_reads;
  end if;
end $$;
