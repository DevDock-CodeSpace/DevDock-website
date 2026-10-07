-- @mentions never worked in channels: a channel has no conversation_members rows, so every mention
-- failed "Mentions must be conversation participants". In a channel anyone in the team can be mentioned;
-- in a DM or group only its participants. (The notify_message_mentions trigger already notifies them.)
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
  v_kind text;
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
  select c.kind into v_kind from public.conversations c where c.id = p_conversation_id;
  select count(distinct user_id)::integer into participant_count from unnest(coalesce(p_mention_ids, '{}')) as ids(user_id);
  select count(*)::integer into valid_count
  from (select distinct user_id from unnest(coalesce(p_mention_ids, '{}')) as ids(user_id)) ids
  where exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = p_conversation_id and cm.user_id = ids.user_id and cm.left_at is null
        )
     or (v_kind = 'channel' and exists (
          select 1 from public.team_members tm
          where tm.team_id = private.conversation_team(p_conversation_id) and tm.user_id = ids.user_id
        ));
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
