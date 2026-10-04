-- Complete the missing Part 1 message contracts before Part 2 extensions.

alter table public.messages
  add constraint messages_deleted_body check (deleted_at is null or content = '[deleted]');

grant delete on public.messages to authenticated;

create policy "Authors can delete messages"
  on public.messages for delete to authenticated
  using (author_id = (select auth.uid()) and private.can_read_conversation(conversation_id));

create or replace function private.touch_message_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.body is distinct from old.body or new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger touch_message_edit
  before update of body, content on public.messages
  for each row execute function private.touch_message_edit();
revoke all on function private.touch_message_edit() from public, anon, authenticated;

create table public.message_pins (
  message_id uuid primary key references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  pinned_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  pinned_at timestamptz not null default now(),
  constraint message_pins_conversation_team_fkey
    foreign key (conversation_id, team_id) references public.conversations(id, team_id) on delete cascade
);
create index message_pins_conversation_idx on public.message_pins (conversation_id, pinned_at desc);
revoke all on table public.message_pins from anon, authenticated;
grant select, insert, delete on public.message_pins to authenticated;
alter table public.message_pins enable row level security;
create policy "Members can see pins" on public.message_pins for select to authenticated using (private.can_read_conversation(conversation_id));
create policy "Conversation managers can pin" on public.message_pins for insert to authenticated with check (private.can_manage_conversation(conversation_id));
create policy "Conversation managers can unpin" on public.message_pins for delete to authenticated using (private.can_manage_conversation(conversation_id));

create or replace function public.mark_conversation_read(
  p_conversation_id uuid,
  p_message_id uuid default null,
  p_thread_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_at timestamptz;
begin
  if not private.can_read_conversation(p_conversation_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select created_at into latest_at from public.messages where id = p_message_id and conversation_id = p_conversation_id;
  insert into public.conversation_reads (conversation_id, user_id, last_message_at, last_message_id, last_thread_at, updated_at)
  values (p_conversation_id, auth.uid(), latest_at, p_message_id, p_thread_at, now())
  on conflict (conversation_id, user_id) do update set
    last_message_at = coalesce(excluded.last_message_at, public.conversation_reads.last_message_at),
    last_message_id = coalesce(excluded.last_message_id, public.conversation_reads.last_message_id),
    last_thread_at = coalesce(excluded.last_thread_at, public.conversation_reads.last_thread_at),
    updated_at = now();
end;
$$;
revoke all on function public.mark_conversation_read(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.mark_conversation_read(uuid, uuid, timestamptz) to authenticated;

create or replace function public.search_messages(
  p_team_id uuid,
  p_query text,
  p_conversation_id uuid default null
)
returns table (
  id uuid,
  conversation_id uuid,
  team_id uuid,
  author_id uuid,
  parent_id uuid,
  content text,
  created_at timestamptz,
  edited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.conversation_id, m.team_id, m.author_id, m.parent_id, m.content, m.created_at, m.edited_at
  from public.messages m
  where m.team_id = p_team_id
    and p_query is not null
    and char_length(btrim(p_query)) between 1 and 200
    and m.deleted_at is null
    and m.content ilike '%' || btrim(p_query) || '%'
    and (p_conversation_id is null or m.conversation_id = p_conversation_id)
    and private.can_read_message(m.id, m.conversation_id, m.created_at)
  order by m.created_at desc, m.id desc
  limit 50;
$$;
revoke all on function public.search_messages(uuid, text, uuid) from public, anon;
grant execute on function public.search_messages(uuid, text, uuid) to authenticated;

-- Realtime invalidation for the new durable Part 1 table.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_pins') then
    alter publication supabase_realtime add table public.message_pins;
  end if;
end $$;
