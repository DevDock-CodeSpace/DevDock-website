-- Email notifications (owner's choice, 2026-10-30): note reminders, new feedback, and meeting invites,
-- changes and cancellations go out by email as well as in the app. Chat, issues and projects come later.
--
-- How it works:
-- - Triggers put a row in public.email_outbox (one per event, never one per recipient). Nobody but the
--   service role reads or writes it.
-- - Every minute, pg_cron runs private.kick_email_worker(): when something is due it calls the
--   send-emails Edge Function (pg_net), which claims a batch with email_claim_batch(), renders and sends
--   it through Resend, and reports back with email_finish_batch(). Nothing is called while nothing waits.
-- - Recipients and the details are read when the email is sent, not when it was queued: a meeting edited
--   twice in a row sends one email with the latest time, and a meeting deleted before its invite went
--   out sends nothing. Meeting emails wait 2 minutes for that reason.
-- - Addresses are read from auth.users at send time and are never stored here.
-- - People turn reminder and meeting emails off in their profile menu (public.email_settings), which
--   also keeps the browser's time zone so times are written in theirs.
-- - A meeting synced to Google Calendar ("Invites" on the meeting page) already emailed everyone through
--   Google, so Calsko doesn't send its own for it.
--
-- Setup per project (by hand, like function secrets; see docs/STATUS.md):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-emails', 'email_worker_url');
--   select vault.create_secret('<random>', 'email_worker_secret');   -- = the function's EMAIL_WORKER_SECRET
-- Without them the queue just waits.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------------------------------
-- Per-person settings.

create table public.email_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  reminders   boolean not null default true,
  meetings    boolean not null default true,
  -- An IANA name from the browser (Intl), e.g. 'America/Chicago'. Checked when an email is written.
  time_zone   text check (char_length(time_zone) <= 64),
  updated_at  timestamptz not null default now()
);

comment on table public.email_settings is 'Which emails a person gets, and their time zone. No row = every email, times in the organizer''s zone.';

create trigger set_updated_at before update on public.email_settings
  for each row execute function public.set_updated_at();

alter table public.email_settings enable row level security;
revoke all on public.email_settings from anon, authenticated;
grant select on public.email_settings to authenticated;

create policy "Read your own email settings" on public.email_settings
  for select to authenticated using (user_id = (select auth.uid()));

-- The only write: your own row, only the values given (null = leave as is).
create function public.save_email_settings(
  p_reminders boolean default null,
  p_meetings boolean default null,
  p_time_zone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_zone text := case when p_time_zone is not null
                      and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_time_zone)
                 then p_time_zone end;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.email_settings as s (user_id, reminders, meetings, time_zone)
  values (v_user, coalesce(p_reminders, true), coalesce(p_meetings, true), v_zone)
  on conflict (user_id) do update set
    reminders = coalesce(p_reminders, s.reminders),
    meetings  = coalesce(p_meetings, s.meetings),
    time_zone = coalesce(v_zone, s.time_zone)
  where (s.reminders, s.meetings, s.time_zone) is distinct from
        (coalesce(p_reminders, s.reminders), coalesce(p_meetings, s.meetings), coalesce(v_zone, s.time_zone));
end;
$$;

revoke all on function public.save_email_settings(boolean, boolean, text) from public, anon;
grant execute on function public.save_email_settings(boolean, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- The outbox.

create table public.email_outbox (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in (
                  'reminder', 'feedback',
                  'meeting_created', 'meeting_changed', 'meeting_cancelled',
                  'series_created', 'series_changed', 'series_cancelled')),
  -- The reminder, feedback, meeting or series the email is about.
  ref_id        uuid not null,
  -- Reminders: the owner. Others: null (meetings read their audience, feedback goes to the support address).
  recipient_id  uuid references auth.users (id) on delete cascade,
  -- What can't be read later: a cancelled meeting's details and audience, a meeting's old time.
  payload       jsonb not null default '{}'::jsonb,
  -- One queued email per thing: a second change while one waits is folded into it.
  dedupe_key    text not null,
  status        text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'skipped', 'failed')),
  attempts      integer not null default 0,
  last_error    text,
  recipients    integer not null default 0,
  send_after    timestamptz not null default now(),
  claimed_at    timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.email_outbox is 'Emails waiting to be sent by the send-emails Edge Function. Service role only.';

create unique index email_outbox_queued_key on public.email_outbox (dedupe_key) where status = 'queued';
create index email_outbox_due_idx on public.email_outbox (send_after) where status in ('queued', 'sending');
create index email_outbox_sent_idx on public.email_outbox (sent_at) where status = 'sent';

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;
-- No policies: only the service role (which bypasses RLS) and the security definer functions below touch it.

-- ---------------------------------------------------------------------------------------------------
-- Producers.

-- Note reminders: the scheduler's bell notification also queues the email.
create function private.queue_reminder_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'reminder' and new.reminder_id is not null then
    insert into public.email_outbox (kind, ref_id, recipient_id, dedupe_key)
    values ('reminder', new.reminder_id, new.recipient_id, 'reminder:' || new.id::text)
    on conflict (dedupe_key) where status = 'queued' do nothing;
  end if;
  return null;
end;
$$;

create trigger queue_reminder_email after insert on public.notifications
  for each row execute function private.queue_reminder_email();

-- Feedback: to the support address.
create function private.queue_feedback_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_outbox (kind, ref_id, dedupe_key)
  values ('feedback', new.id, 'feedback:' || new.id::text)
  on conflict (dedupe_key) where status = 'queued' do nothing;
  return null;
end;
$$;

create trigger queue_feedback_email after insert on public.feedback
  for each row execute function private.queue_feedback_email();

-- Meetings. A series (create_live_series inserts up to 60 rows at once) is one email.
create function private.queue_meeting_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text;
  v_wait  constant interval := interval '2 minutes';
  v_people uuid[];
begin
  if tg_op = 'INSERT' then
    if new.ends_at <= now() then
      return null;
    end if;
    if new.series_id is not null then
      insert into public.email_outbox (kind, ref_id, dedupe_key, send_after)
      values ('series_created', new.series_id, 'series:' || new.series_id::text, now() + v_wait)
      on conflict (dedupe_key) where status = 'queued' do nothing;
    else
      insert into public.email_outbox (kind, ref_id, dedupe_key, send_after)
      values ('meeting_created', new.id, 'meeting:' || new.id::text, now() + v_wait)
      on conflict (dedupe_key) where status = 'queued' do nothing;
    end if;
    return null;
  end if;

  if tg_op = 'UPDATE' then
    if (new.starts_at, new.ends_at, new.title) is not distinct from (old.starts_at, old.ends_at, old.title)
       or new.ends_at <= now() then
      return null;
    end if;
    v_key := case when new.series_id is not null then 'series:' || new.series_id::text else 'meeting:' || new.id::text end;
    -- The invite hasn't gone yet: it will carry the new details.
    if exists (select 1 from public.email_outbox o where o.dedupe_key = v_key and o.status = 'queued') then
      return null;
    end if;
    if new.series_id is not null then
      insert into public.email_outbox (kind, ref_id, dedupe_key, send_after)
      values ('series_changed', new.series_id, v_key || ':changed', now() + v_wait)
      on conflict (dedupe_key) where status = 'queued' do nothing;
    else
      -- The first old time is kept when several changes are folded together.
      insert into public.email_outbox (kind, ref_id, dedupe_key, send_after, payload)
      values ('meeting_changed', new.id, v_key || ':changed', now() + v_wait,
              jsonb_build_object('old_title', old.title, 'old_starts_at', old.starts_at, 'old_ends_at', old.ends_at))
      on conflict (dedupe_key) where status = 'queued' do nothing;
    end if;
    return null;
  end if;

  -- DELETE
  v_key := case when old.series_id is not null then 'series:' || old.series_id::text else 'meeting:' || old.id::text end;
  -- Never announced: nothing to cancel (a queued series invite reads whatever is left).
  if old.ends_at <= now()
     or exists (select 1 from public.email_outbox o where o.dedupe_key = v_key and o.status = 'queued') then
    return null;
  end if;
  -- Deleted with its group or workspace: nobody to tell.
  if not exists (select 1 from public.teams t where t.id = old.team_id)
     or (old.workspace_id is not null and not exists (select 1 from public.workspaces w where w.id = old.workspace_id)) then
    return null;
  end if;
  -- A pending change email is replaced by the cancellation.
  update public.email_outbox o set status = 'skipped'
  where o.dedupe_key = v_key || ':changed' and o.status = 'queued' and old.series_id is null;

  select coalesce(array_agg(m.user_id), '{}') into v_people
  from public.team_members m
  where m.team_id = old.team_id
    and m.user_id is distinct from old.created_by
    and (old.workspace_id is null or private.has_workspace_access(old.workspace_id, m.user_id));

  insert into public.email_outbox (kind, ref_id, dedupe_key, send_after, payload)
  values (
    case when old.series_id is not null then 'series_cancelled' else 'meeting_cancelled' end,
    coalesce(old.series_id, old.id),
    v_key || ':cancelled',
    now() + v_wait,
    jsonb_build_object(
      'title', old.title, 'team_id', old.team_id, 'workspace_id', old.workspace_id, 'created_by', old.created_by,
      'google', old.calendar_event_id is not null, 'recipients', to_jsonb(v_people),
      'dates', jsonb_build_array(jsonb_build_object('starts_at', old.starts_at, 'ends_at', old.ends_at)))
  )
  on conflict (dedupe_key) where status = 'queued' do update set
    payload = jsonb_set(public.email_outbox.payload, '{dates}',
      (public.email_outbox.payload -> 'dates') || (excluded.payload -> 'dates'));
  return null;
end;
$$;

create trigger queue_meeting_email after insert or update or delete on public.live_sessions
  for each row execute function private.queue_meeting_email();

-- ---------------------------------------------------------------------------------------------------
-- The worker's side (service role only).

-- Claims up to p_limit due emails and returns one message per recipient, with everything the template
-- needs. Emails with nobody left to send to are marked skipped here. p_daily_cap keeps a runaway day
-- inside Resend's free plan (100 a day): over it, everything waits.
create function public.email_claim_batch(p_limit integer default 20, p_daily_cap integer default 90)
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

-- The worker's report: [{ "id": …, "ok": true, "recipients": 3 } | { "id": …, "ok": false, "error": "…" }].
-- A failure is retried twice (after 5 and 10 minutes), then left as failed.
create function public.email_finish_batch(p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_id uuid;
begin
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    v_id := (r ->> 'id')::uuid;
    if coalesce((r ->> 'ok')::boolean, false) then
      update public.email_outbox o
      set status = 'sent', sent_at = now(), recipients = coalesce((r ->> 'recipients')::integer, 1), last_error = null
      where o.id = v_id and o.status = 'sending';
    else
      update public.email_outbox o
      set status = case
                     when o.attempts >= 3 then 'failed'
                     -- Another email for the same thing is already waiting: it supersedes this one.
                     when exists (select 1 from public.email_outbox q where q.dedupe_key = o.dedupe_key and q.status = 'queued') then 'skipped'
                     else 'queued'
                   end,
          send_after = now() + make_interval(mins => 5 * o.attempts),
          last_error = left(r ->> 'error', 500)
      where o.id = v_id and o.status = 'sending';
    end if;
  end loop;
end;
$$;

revoke all on function public.email_finish_batch(jsonb) from public, anon, authenticated;
grant execute on function public.email_finish_batch(jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------
-- The kick: once a minute, and only when something is due, call the worker.

create function private.kick_email_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.email_outbox o
    where (o.status = 'queued' and o.send_after <= now())
       or (o.status = 'sending' and o.claimed_at < now() - interval '10 minutes')
  ) then
    return;
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'email_worker_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'email_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.kick_email_worker() from public, anon, authenticated;

select cron.schedule('kick-email-worker', '* * * * *', 'select private.kick_email_worker()');
-- Sent and skipped rows are kept a month for questions like "did that invite go out?".
select cron.schedule('purge-email-outbox', '23 3 * * *',
  $$delete from public.email_outbox where status in ('sent', 'skipped', 'failed') and created_at < now() - interval '30 days'$$);
