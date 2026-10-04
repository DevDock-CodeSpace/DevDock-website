-- Team-scoped messaging foundation.
-- Private conversations are authorized by membership, never by team role.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('channel', 'dm', 'group')),
  name text,
  description text,
  is_archived boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_id_team_key unique (id, team_id),
  constraint conversations_name check (
    (kind = 'channel' and name is not null and char_length(btrim(name)) between 1 and 80)
    or (kind = 'dm' and name is null)
    or (kind = 'group' and name is not null and char_length(btrim(name)) between 1 and 120)
  )
);

create unique index conversations_channel_name_idx
  on public.conversations (team_id, lower(name)) where kind = 'channel';
create unique index conversations_general_idx
  on public.conversations (team_id) where kind = 'channel' and lower(name) = 'general';
create index conversations_team_updated_idx on public.conversations (team_id, updated_at desc, id desc);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (conversation_id, user_id),
  constraint conversation_members_conversation_team_fkey
    foreign key (conversation_id, team_id) references public.conversations(id, team_id) on delete cascade,
  constraint conversation_members_active check (left_at is null or left_at >= joined_at)
);

create unique index conversation_members_active_user_idx
  on public.conversation_members (conversation_id, user_id) where left_at is null;
create index conversation_members_user_team_idx
  on public.conversation_members (team_id, user_id) where left_at is null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  parent_id uuid references public.messages(id) on delete set null,
  client_id uuid not null,
  body jsonb not null,
  content text not null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_conversation_team_fkey
    foreign key (conversation_id, team_id) references public.conversations(id, team_id) on delete cascade,
  constraint messages_content_length check (char_length(content) between 1 and 20_000),
  constraint messages_body_size check (pg_column_size(body) <= 2 * 1024 * 1024),
  constraint messages_body_object check (jsonb_typeof(body) = 'object')
);

create unique index messages_client_id_idx on public.messages (conversation_id, author_id, client_id);
create index messages_conversation_cursor_idx
  on public.messages (conversation_id, created_at desc, id desc);
create index messages_parent_cursor_idx
  on public.messages (parent_id, created_at, id);

create function private.message_parent_is_original()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.messages;
begin
  if new.parent_id is null then return new; end if;
  select * into parent from public.messages where id = new.parent_id;
  if not found or parent.conversation_id <> new.conversation_id or parent.team_id <> new.team_id or parent.parent_id is not null then
    raise exception 'Replies must target an original message' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_message_parent
  before insert or update of parent_id on public.messages
  for each row execute function private.message_parent_is_original();

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (emoji ~ '^[^[:cntrl:]]{1,32}$'),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji),
  constraint message_reactions_conversation_fkey
    foreign key (conversation_id, team_id) references public.conversations(id, team_id) on delete cascade
);
create index message_reactions_conversation_idx on public.message_reactions (conversation_id, message_id);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  last_message_id uuid references public.messages(id) on delete set null,
  last_thread_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.conversation_preferences (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  notification_mode text not null default 'mentions' check (notification_mode in ('all', 'mentions', 'muted')),
  following boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  recipient_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  kind text not null check (kind in ('mention', 'message', 'thread', 'call')),
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc, id desc);

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
      and (
        (c1.kind = 'channel' and private.is_team_member(c1.team_id))
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
    where c1.id = c and (
      (c1.kind = 'channel' and private.is_team_admin(c1.team_id))
      or exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = c1.id and cm.user_id = (select auth.uid()) and cm.role = 'owner' and cm.left_at is null
      )
    )
  );
$$;

create or replace function private.conversation_team(c uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select team_id from public.conversations where id = c; $$;

create or replace function public.ensure_general_channel(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare channel_id uuid;
begin
  if not private.is_team_member(p_team_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.conversations (team_id, kind, name, description)
  values (p_team_id, 'channel', 'general', 'A shared space for everyone in the group.')
  on conflict (team_id, lower(name)) where kind = 'channel' do update set updated_at = public.conversations.updated_at
  returning id into channel_id;
  return channel_id;
end;
$$;

create or replace function private.create_general_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversations (team_id, kind, name, description, created_by)
  values (new.id, 'channel', 'general', 'A shared space for everyone in the group.', new.created_by)
  on conflict (team_id, lower(name)) where kind = 'channel' do nothing;
  return new;
end;
$$;

create trigger create_team_general_channel
  after insert on public.teams
  for each row execute function private.create_general_channel();

create or replace function public.create_direct_conversation(p_team_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare conversation_id uuid;
begin
  if p_user_id = (select auth.uid()) or not private.is_team_member(p_team_id) or not exists (
    select 1 from public.team_members where team_id = p_team_id and user_id = p_user_id
  ) then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_team_id::text || ':' || least((select auth.uid())::text, p_user_id::text) || ':' || greatest((select auth.uid())::text, p_user_id::text),
    0
  ));
  select c.id into conversation_id
  from public.conversations c
  where c.team_id = p_team_id and c.kind = 'dm'
    and (select count(*) from public.conversation_members cm
         where cm.conversation_id = c.id and cm.left_at is null
           and cm.user_id in ((select auth.uid()), p_user_id)) = 2
    and (select count(*) from public.conversation_members cm
         where cm.conversation_id = c.id and cm.left_at is null) = 2
  limit 1;
  if conversation_id is not null then return conversation_id; end if;
  insert into public.conversations (team_id, kind, created_by) values (p_team_id, 'dm', auth.uid()) returning id into conversation_id;
  insert into public.conversation_members (conversation_id, team_id, user_id, role)
  values (conversation_id, p_team_id, auth.uid(), 'owner'), (conversation_id, p_team_id, p_user_id, 'member');
  return conversation_id;
exception when unique_violation then
  select c.id into conversation_id from public.conversations c
  join public.conversation_members cm on cm.conversation_id = c.id
  where c.team_id = p_team_id and c.kind = 'dm' and cm.user_id in (auth.uid(), p_user_id) and cm.left_at is null
  group by c.id having count(*) = 2 limit 1;
  if conversation_id is null then raise; end if;
  return conversation_id;
end;
$$;

create or replace function public.create_group_conversation(p_team_id uuid, p_name text, p_user_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare conversation_id uuid;
begin
  if not private.is_team_member(p_team_id) or char_length(btrim(p_name)) not between 1 and 120
     or not (select (select auth.uid()) = any(p_user_ids))
     or exists (select 1 from unnest(p_user_ids) user_id where not exists (select 1 from public.team_members where team_id = p_team_id and team_members.user_id = user_id))
  then raise exception 'Invalid group conversation' using errcode = '42501'; end if;
  insert into public.conversations (team_id, kind, name, created_by) values (p_team_id, 'group', btrim(p_name), auth.uid()) returning id into conversation_id;
  insert into public.conversation_members (conversation_id, team_id, user_id, role)
  select conversation_id, p_team_id, user_id, case when user_id = (select auth.uid()) then 'owner' else 'member' end
  from (select distinct unnest(p_user_ids) as user_id) people;
  return conversation_id;
end;
$$;

create or replace function public.create_channel(p_team_id uuid, p_name text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare conversation_id uuid;
begin
  if not private.is_team_admin(p_team_id) or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.conversations (team_id, kind, name, description) values (p_team_id, 'channel', btrim(p_name), nullif(btrim(p_description), '')) returning id into conversation_id;
  return conversation_id;
end;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_client_id uuid,
  p_body jsonb,
  p_content text,
  p_parent_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare result public.messages;
begin
  if not private.can_read_conversation(p_conversation_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if char_length(btrim(p_content)) not between 1 and 20000 or jsonb_typeof(p_body) <> 'object' then
    raise exception 'Invalid message' using errcode = '22023';
  end if;
  insert into public.messages (conversation_id, team_id, author_id, parent_id, client_id, body, content)
  values (p_conversation_id, private.conversation_team(p_conversation_id), auth.uid(), p_parent_id, p_client_id, p_body, p_content)
  on conflict (conversation_id, author_id, client_id) do update set client_id = excluded.client_id
  returning * into result;
  return result;
end;
$$;

-- Existing teams are created lazily by the first messages query; new teams use
-- the trigger above. This function is intentionally the only public bootstrap.
revoke all on function public.ensure_general_channel(uuid), public.create_direct_conversation(uuid, uuid), public.create_group_conversation(uuid, text, uuid[]), public.create_channel(uuid, text, text), public.send_message(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.ensure_general_channel(uuid), public.create_direct_conversation(uuid, uuid), public.create_group_conversation(uuid, text, uuid[]), public.create_channel(uuid, text, text), public.send_message(uuid, uuid, jsonb, text, uuid) to authenticated;
revoke all on function private.can_read_conversation(uuid), private.can_manage_conversation(uuid), private.conversation_team(uuid), private.create_general_channel() from public, anon, authenticated;

revoke all on table public.conversations, public.conversation_members, public.messages, public.message_reactions,
  public.conversation_reads, public.conversation_preferences, public.notifications from anon, authenticated;
grant select on public.conversations, public.conversation_members, public.messages, public.message_reactions to authenticated;
grant update (is_archived, name, description) on public.conversations to authenticated;
grant update (body, content, edited_at, deleted_at) on public.messages to authenticated;
grant insert, update, delete on public.message_reactions to authenticated;
grant select, insert, update on public.conversation_reads, public.conversation_preferences to authenticated;
grant select, update on public.notifications to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.conversation_preferences enable row level security;
alter table public.notifications enable row level security;

create policy "Members can read conversations" on public.conversations for select to authenticated using (private.can_read_conversation(id));
create policy "Managers can change channels" on public.conversations for update to authenticated using (private.can_manage_conversation(id)) with check (private.can_manage_conversation(id));
create policy "Members can read conversation members" on public.conversation_members for select to authenticated using (private.can_read_conversation(conversation_id));
create policy "Members can read messages" on public.messages for select to authenticated using (private.can_read_conversation(conversation_id));
create policy "Authors can edit messages" on public.messages for update to authenticated using (author_id = (select auth.uid()) and private.can_read_conversation(conversation_id)) with check (author_id = (select auth.uid()));
create policy "Members can read reactions" on public.message_reactions for select to authenticated using (private.can_read_conversation(conversation_id));
create policy "Members can change own reactions" on public.message_reactions for all to authenticated using (user_id = (select auth.uid()) and private.can_read_conversation(conversation_id)) with check (user_id = (select auth.uid()) and private.can_read_conversation(conversation_id));
create policy "People manage own reads" on public.conversation_reads for all to authenticated using (user_id = (select auth.uid()) and private.can_read_conversation(conversation_id)) with check (user_id = (select auth.uid()) and private.can_read_conversation(conversation_id));
create policy "People manage own preferences" on public.conversation_preferences for all to authenticated using (user_id = (select auth.uid()) and private.can_read_conversation(conversation_id)) with check (user_id = (select auth.uid()) and private.can_read_conversation(conversation_id));
create policy "People read own notifications" on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy "People update own notifications" on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array['conversations', 'conversation_members', 'messages', 'message_reactions', 'conversation_reads', 'conversation_preferences', 'notifications'] loop
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;