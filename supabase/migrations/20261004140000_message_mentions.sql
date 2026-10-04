-- Mentions are explicit, participant-validated records; text alone never grants access.
create table public.message_mentions (
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, mentioned_user_id),
  constraint message_mentions_conversation_team_fkey
    foreign key (conversation_id, team_id) references public.conversations(id, team_id) on delete cascade
);
create index message_mentions_recipient_idx on public.message_mentions (mentioned_user_id, created_at desc);
revoke all on table public.message_mentions from anon, authenticated;
grant select on public.message_mentions to authenticated;
alter table public.message_mentions enable row level security;
create policy "Members can see valid mentions" on public.message_mentions for select to authenticated using (private.can_read_conversation(conversation_id));

create or replace function public.send_message(
  p_conversation_id uuid,
  p_client_id uuid,
  p_body jsonb,
  p_content text,
  p_parent_id uuid default null,
  p_mention_ids uuid[] default '{}'
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.messages;
  participant_count integer;
  valid_count integer;
begin
  if not private.can_read_conversation(p_conversation_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if char_length(btrim(p_content)) not between 1 and 20000 or jsonb_typeof(p_body) <> 'object' then
    raise exception 'Invalid message' using errcode = '22023';
  end if;
  if p_parent_id is not null and not exists (select 1 from public.messages where id = p_parent_id and conversation_id = p_conversation_id and parent_id is null) then
    raise exception 'Replies must target an original message' using errcode = '23514';
  end if;
  select count(distinct user_id)::integer into participant_count from unnest(coalesce(p_mention_ids, '{}')) as ids(user_id);
  select count(*)::integer into valid_count
  from unnest(coalesce(p_mention_ids, '{}')) as ids(user_id)
  join public.conversation_members cm on cm.conversation_id = p_conversation_id and cm.user_id = ids.user_id and cm.left_at is null;
  if participant_count <> valid_count then raise exception 'Mentions must be conversation participants' using errcode = '42501'; end if;
  insert into public.messages (conversation_id, team_id, author_id, parent_id, client_id, body, content)
  values (p_conversation_id, private.conversation_team(p_conversation_id), auth.uid(), p_parent_id, p_client_id, p_body, p_content)
  on conflict (conversation_id, author_id, client_id) do update set client_id = excluded.client_id
  returning * into result;
  insert into public.message_mentions (message_id, conversation_id, team_id, mentioned_user_id)
  select result.id, result.conversation_id, result.team_id, ids.user_id
  from (select distinct unnest(coalesce(p_mention_ids, '{}')) as user_id) ids
  where ids.user_id <> result.author_id
  on conflict do nothing;
  return result;
end;
$$;

revoke all on function public.send_message(uuid, uuid, jsonb, text, uuid, uuid[]) from public, anon;
grant execute on function public.send_message(uuid, uuid, jsonb, text, uuid, uuid[]) to authenticated;

create function private.notify_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (team_id, recipient_id, conversation_id, message_id, kind, dedupe_key)
  values (new.team_id, new.mentioned_user_id, new.conversation_id, new.message_id, 'mention', 'mention:' || new.message_id::text || ':' || new.mentioned_user_id::text)
  on conflict (recipient_id, dedupe_key) do nothing;
  return new;
end;
$$;
create trigger notify_message_mentions
  after insert on public.message_mentions
  for each row execute function private.notify_message_mentions();
revoke all on function private.notify_message_mentions() from public, anon, authenticated;
