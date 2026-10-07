-- Edit/delete as RPCs (authors only, validated server-side) and per-conversation unread counts.
-- The direct column UPDATE grant on public.messages is revoked in a later migration, once every
-- open client has moved to these functions.

create or replace function public.edit_message(p_message_id uuid, p_content text, p_body jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(p_content)) not between 1 and 20000 or jsonb_typeof(p_body) <> 'object' then
    raise exception 'Invalid message' using errcode = '22023';
  end if;
  update public.messages m
     set content = btrim(p_content), body = p_body
   where m.id = p_message_id
     and m.author_id = (select auth.uid())
     and m.deleted_at is null
     and private.can_read_message(m.id, m.conversation_id, m.created_at);
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
end;
$$;

create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages m
     set content = '[deleted]',
         body = '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
         deleted_at = now()
   where m.id = p_message_id
     and m.author_id = (select auth.uid())
     and m.deleted_at is null
     and private.can_read_message(m.id, m.conversation_id, m.created_at);
  if not found then raise exception 'Not allowed' using errcode = '42501'; end if;
  delete from public.message_pins where message_id = p_message_id;
  delete from public.message_reactions where message_id = p_message_id;
  delete from public.message_attachments where message_id = p_message_id;
end;
$$;

-- Unread = other people's top-level messages since the caller's read marker (or since they joined).
create or replace function public.conversation_unread_counts(p_team_id uuid)
returns table (conversation_id uuid, unread_count integer, mention_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.id,
           coalesce(r.last_message_at, cm.joined_at, '-infinity'::timestamptz) as since
      from public.conversations c
      left join public.conversation_members cm
        on cm.conversation_id = c.id and cm.user_id = (select auth.uid()) and cm.left_at is null
      left join public.conversation_reads r
        on r.conversation_id = c.id and r.user_id = (select auth.uid())
     where c.team_id = p_team_id
       and not c.is_archived
       and private.can_read_conversation(c.id)
  )
  select mine.id,
         count(m.id)::integer,
         count(mm.message_id)::integer
    from mine
    left join public.messages m
      on m.conversation_id = mine.id
     and m.parent_id is null
     and m.deleted_at is null
     and m.author_id <> (select auth.uid())
     and m.created_at > mine.since
     and private.can_read_message(m.id, m.conversation_id, m.created_at)
    left join public.message_mentions mm
      on mm.message_id = m.id and mm.mentioned_user_id = (select auth.uid())
   group by mine.id;
$$;

revoke all on function public.edit_message(uuid, text, jsonb), public.delete_message(uuid), public.conversation_unread_counts(uuid) from public, anon;
grant execute on function public.edit_message(uuid, text, jsonb), public.delete_message(uuid), public.conversation_unread_counts(uuid) to authenticated;
