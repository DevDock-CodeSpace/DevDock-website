-- Notify current participants about new direct and group messages.
-- Channels intentionally do not create alerts by default; they only advance
-- future read state, matching the messaging notification policy.

create function private.notify_message_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (
    team_id, recipient_id, conversation_id, message_id, kind, dedupe_key
  )
  select new.team_id, cm.user_id, new.conversation_id, new.id, 'message', 'message:' || new.id::text
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  where cm.conversation_id = new.conversation_id
    and cm.left_at is null
    and cm.user_id <> new.author_id
    and c.kind in ('dm', 'group')
  on conflict (recipient_id, dedupe_key) do nothing;
  return new;
end;
$$;

create trigger notify_message_participants
  after insert on public.messages
  for each row execute function private.notify_message_participants();

revoke all on function private.notify_message_participants() from public, anon, authenticated;