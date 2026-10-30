-- Chat emails show message times in the reader's own time zone (email_settings.time_zone, saved at sign-in),
-- not UTC. Only the chat part of the claim changes.

create or replace function public.email_claim_batch(p_limit integer default 20, p_daily_cap integer default 90)
returns table (outbox_id uuid, kind text, to_email text, reply_to text, time_zone text, data jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if (select coalesce(sum(o.recipients), 0) from public.email_outbox o
      where o.status = 'sent' and o.sent_at > now() - interval '1 day') >= p_daily_cap then
    return;
  end if;

  with due as (
    select o.id from public.email_outbox o
    where (o.status = 'queued' and o.send_after <= now())
       or (o.status = 'sending' and o.claimed_at < now() - interval '10 minutes')
    order by o.send_after
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.email_outbox o set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
    from due where o.id = due.id
    returning o.id
  )
  select coalesce(array_agg(claimed.id), '{}') into v_ids from claimed;
  if cardinality(v_ids) = 0 then
    return;
  end if;

  create temporary table if not exists pg_temp.email_batch (
    outbox_id uuid, kind text, to_email text, reply_to text, time_zone text, data jsonb
  ) on commit drop;
  truncate pg_temp.email_batch;

  -- Note reminders: still open, owner still wants them.
  insert into pg_temp.email_batch
  select o.id, o.kind, u.email::text, null, es.time_zone,
         jsonb_build_object(
           'title', r.title, 'notes', r.notes, 'team_name', t.name, 'remind_at', r.remind_at,
           'workspace_name', w.title,
           'issue', case when i.id is not null then w.issue_key || '-' || i.number || ' ' || i.title end,
           'path', case when i.id is not null then '/t/' || t.slug || '/w/' || w.id || '/issues/' || i.number
                        else '/t/' || t.slug || '/reminders?r=' || r.id end)
  from public.email_outbox o
  join public.reminders r on r.id = o.ref_id and r.status = 'pending'
  join public.teams t on t.id = r.team_id
  join auth.users u on u.id = o.recipient_id and u.email is not null
  left join public.workspaces w on w.id = r.workspace_id
  left join public.issues i on i.id = r.issue_id
  left join public.email_settings es on es.user_id = o.recipient_id
  where o.id = any(v_ids) and o.kind = 'reminder' and coalesce(es.reminders, true);

  -- Feedback: to the support address (the function's FEEDBACK_EMAIL_TO); replies go to the sender.
  insert into pg_temp.email_batch
  select o.id, o.kind, null, u.email::text, null,
         jsonb_build_object(
           'kind', f.kind, 'message', f.message, 'page', f.page, 'context', f.context, 'created_at', f.created_at,
           'sender_name', coalesce(p.display_name, u.raw_user_meta_data ->> 'full_name', u.email),
           'sender_email', u.email, 'team_name', t.name)
  from public.email_outbox o
  join public.feedback f on f.id = o.ref_id
  left join auth.users u on u.id = f.user_id
  left join public.profiles p on p.id = f.user_id
  left join public.teams t on t.id = f.team_id
  where o.id = any(v_ids) and o.kind = 'feedback';

  -- Meetings that still exist: the meeting (or the series' upcoming meetings) and its audience now.
  insert into pg_temp.email_batch
  select o.id, o.kind, u.email::text, null, coalesce(es.time_zone, org.time_zone), m.data
  from public.email_outbox o
  cross join lateral (
    select s.team_id, s.workspace_id, s.created_by,
           jsonb_build_object(
             'title', min(s.title), 'description', min(s.description),
             'team_name', min(t.name), 'workspace_name', min(w.title),
             'organizer', min(coalesce(p.display_name, 'Someone')),
             'path', '/t/' || min(t.slug) || '/live/' || (array_agg(s.id order by s.starts_at))[1],
             'old', o.payload,
             'dates', jsonb_agg(jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.starts_at)) as data
    from public.live_sessions s
    join public.teams t on t.id = s.team_id
    left join public.workspaces w on w.id = s.workspace_id
    left join public.profiles p on p.id = s.created_by
    where (case when o.kind like 'series_%' then s.series_id else s.id end) = o.ref_id
      and s.ends_at > now()
    group by s.team_id, s.workspace_id, s.created_by
    having bool_and(s.calendar_event_id is null)
  ) m
  join public.team_members tm on tm.team_id = m.team_id
  join auth.users u on u.id = tm.user_id and u.email is not null
  left join public.email_settings es on es.user_id = tm.user_id
  left join public.email_settings org on org.user_id = m.created_by
  where o.id = any(v_ids)
    and o.kind in ('meeting_created', 'meeting_changed', 'series_created', 'series_changed')
    and tm.user_id is distinct from m.created_by
    and coalesce(es.meetings, true)
    and (m.workspace_id is null or private.has_workspace_access(m.workspace_id, tm.user_id));

  -- Cancelled meetings: the details and audience saved when they were deleted.
  insert into pg_temp.email_batch
  select o.id, o.kind, u.email::text, null, coalesce(es.time_zone, org.time_zone),
         jsonb_build_object(
           'title', o.payload ->> 'title', 'team_name', t.name, 'workspace_name', w.title,
           'organizer', coalesce(p.display_name, 'Someone'),
           'path', '/t/' || t.slug || '/live',
           'dates', o.payload -> 'dates')
  from public.email_outbox o
  join public.teams t on t.id = (o.payload ->> 'team_id')::uuid
  left join public.workspaces w on w.id = (o.payload ->> 'workspace_id')::uuid
  left join public.profiles p on p.id = (o.payload ->> 'created_by')::uuid
  left join public.email_settings org on org.user_id = (o.payload ->> 'created_by')::uuid
  cross join lateral jsonb_array_elements_text(o.payload -> 'recipients') as rid(user_id)
  join auth.users u on u.id = rid.user_id::uuid and u.email is not null
  left join public.email_settings es on es.user_id = u.id
  where o.id = any(v_ids)
    and o.kind in ('meeting_cancelled', 'series_cancelled')
    and not coalesce((o.payload ->> 'google')::boolean, false)
    and coalesce(es.meetings, true)
    -- Still in the group (left since: no email).
    and exists (select 1 from public.team_members tm where tm.team_id = t.id and tm.user_id = u.id);

  -- Chat: what is still unread in the conversation (the person read it meanwhile: nothing to send), the
  -- latest five messages, unless the conversation is muted.
  insert into pg_temp.email_batch
  select o.id, o.kind, u.email::text, null, es.time_zone,
         jsonb_build_object(
           'team_name', t.name,
           'conversation_kind', c.kind,
           'conversation_name', case
             when c.kind = 'channel' then '#' || c.name
             when c.name is not null then c.name
             else (select string_agg(coalesce(p.display_name, 'Someone'), ', ' order by p.display_name)
                   from public.conversation_members cm join public.profiles p on p.id = cm.user_id
                   where cm.conversation_id = c.id and cm.left_at is null and cm.user_id <> o.recipient_id)
           end,
           'unread', un.n,
           'mentioned', un.mentioned,
           'messages', (select jsonb_agg(x order by x ->> 'created_at') from (
               select jsonb_build_object(
                        'author', coalesce(p.display_name, 'Someone'),
                        'content', left(msg.content, 400),
                        'created_at', msg.created_at,
                        'reply', msg.parent_id is not null) as x
               from public.messages msg
               left join public.profiles p on p.id = msg.author_id
               where msg.deleted_at is null and msg.id in (
                 select n.message_id from public.notifications n
                 where n.recipient_id = o.recipient_id and n.conversation_id = c.id and n.read_at is null)
               order by msg.created_at desc
               limit 5) latest),
           'path', '/t/' || t.slug || '/messages?c=' || c.id || coalesce('&m=' || un.last_message::text, ''))
  from public.email_outbox o
  join public.conversations c on c.id = o.ref_id
  join public.teams t on t.id = c.team_id
  join auth.users u on u.id = o.recipient_id and u.email is not null
  cross join lateral (
    -- One message can bring two notifications (a mention in a DM): count messages, not notifications.
    select count(distinct n.message_id) as n,
           bool_or(n.kind = 'mention') as mentioned,
           (array_agg(coalesce(msg.parent_id, msg.id) order by n.created_at desc))[1] as last_message
    from public.notifications n
    left join public.messages msg on msg.id = n.message_id
    where n.recipient_id = o.recipient_id and n.conversation_id = c.id and n.read_at is null
      and n.kind in ('mention', 'message', 'thread')
  ) un
  left join public.email_settings es on es.user_id = o.recipient_id
  left join public.conversation_preferences cp on cp.conversation_id = c.id and cp.user_id = o.recipient_id
  where o.id = any(v_ids) and o.kind = 'chat'
    and un.n > 0
    and coalesce(es.chat, true)
    and coalesce(cp.notification_mode, 'mentions') <> 'muted';

  update public.email_outbox o set status = 'skipped'
  where o.id = any(v_ids) and not exists (select 1 from pg_temp.email_batch b where b.outbox_id = o.id);

  return query
    select b.outbox_id, b.kind, b.to_email, b.reply_to,
           case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = b.time_zone) then b.time_zone end,
           b.data
    from pg_temp.email_batch b;
end;
$$;

revoke all on function public.email_claim_batch(integer, integer) from public, anon, authenticated;
grant execute on function public.email_claim_batch(integer, integer) to service_role;
