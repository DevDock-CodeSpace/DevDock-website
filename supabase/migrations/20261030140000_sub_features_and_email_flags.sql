-- Sub-features (owner's choice, 2026-10-30): a feature flag can have sub-features, each switched on its
-- own, per group, like any flag. A sub-feature only counts as on while its parent is on too, so turning
-- the parent off turns the whole feature off without losing how its parts were set. One level deep.
--
-- The first: email. `email` is the parent; its parts are invites, note reminders, feedback and meeting
-- invites/changes/cancellations. Meetings start off everywhere (invites go through Google Calendar for
-- now, and a second email would double them); the rest start on, as they were built.

alter table public.feature_flags
  add column parent text references public.feature_flags (key) on delete cascade on update cascade;

create index feature_flags_parent_idx on public.feature_flags (parent) where parent is not null;

-- One level: a parent can't itself be a sub-feature, and a flag can't be its own parent.
create function private.check_feature_flag_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent is not null and (
       new.parent = new.key
       or exists (select 1 from public.feature_flags f where f.key = new.parent and f.parent is not null)
       or exists (select 1 from public.feature_flags f where f.parent = new.key)
     ) then
    raise exception 'Sub-features are one level deep' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_feature_flag_parent before insert or update of parent on public.feature_flags
  for each row execute function private.check_feature_flag_parent();

-- A flag's own value for a group: the group's setting, else the default.
create function private.feature_own_enabled(p_team uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select tf.enabled from public.team_feature_flags tf where tf.team_id = p_team and tf.flag = p_key),
    (select f.default_enabled from public.feature_flags f where f.key = p_key),
    false
  );
$$;

revoke execute on function private.feature_own_enabled(uuid, text) from public, anon, authenticated;

-- Whether a flag is on for a group: its own value, and its parent's when it has one. Unknown flags are
-- off. p_team null (feedback from someone outside any group) uses the defaults.
create or replace function private.feature_enabled(p_team uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.feature_own_enabled(p_team, p_key)
     and coalesce((select private.feature_own_enabled(p_team, f.parent)
                   from public.feature_flags f where f.key = p_key and f.parent is not null), true);
$$;

-- The keys the app sees: the same rule (a sub-feature only while its parent is on).
create or replace function public.enabled_features(t public.teams)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not (private.is_team_member(t.id) or private.is_platform_admin()) then '{}'::text[]
    else coalesce((
      select array_agg(f.key order by f.key)
      from public.feature_flags f
      left join public.team_feature_flags tf on tf.flag = f.key and tf.team_id = t.id
      left join public.feature_flags pf on pf.key = f.parent
      left join public.team_feature_flags ptf on ptf.flag = pf.key and ptf.team_id = t.id
      where coalesce(tf.enabled, f.default_enabled)
        and (f.parent is null or coalesce(ptf.enabled, pf.default_enabled))
    ), '{}'::text[])
  end;
$$;

-- The console's list now says which flag each sub-feature belongs to.
drop function public.admin_feature_flags();

create function public.admin_feature_flags()
returns table (
  key text,
  parent text,
  description text,
  default_enabled boolean,
  updated_at timestamptz,
  overrides jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
  select f.key, f.parent, f.description, f.default_enabled, f.updated_at,
         coalesce((
           select jsonb_agg(jsonb_build_object('team_id', tf.team_id, 'enabled', tf.enabled))
           from public.team_feature_flags tf
           where tf.flag = f.key
         ), '[]'::jsonb)
  from public.feature_flags f
  -- Parents in key order, each followed by its sub-features.
  order by coalesce(f.parent, f.key), f.parent is not null, f.key;
end;
$$;

revoke execute on function public.admin_feature_flags() from public, anon;
grant execute on function public.admin_feature_flags() to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- The email flags.

insert into public.feature_flags (key, description, default_enabled) values
  ('email', 'Emails from Calsko. Off turns every email below off for the group.', true);
insert into public.feature_flags (key, parent, description, default_enabled) values
  ('email_invites', 'email', 'Group invites by email: Members → Email invites, a single-use code per address.', true),
  ('email_reminders', 'email', 'Note reminders: the note''s owner gets an email when a timed note is due.', true),
  ('email_feedback', 'email', 'New feedback from this group''s people is emailed to the support address.', true),
  ('email_meetings', 'email', 'Meeting invites, changes and cancellations to the meeting''s audience. Meetings synced to Google Calendar are skipped.', false);

-- Each email checks its sub-feature when it is queued (so a feature that is off costs nothing) and
-- again when it is sent (so switching it off stops what is already waiting).

create or replace function private.queue_reminder_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'reminder' and new.reminder_id is not null and private.feature_enabled(new.team_id, 'email_reminders') then
    insert into public.email_outbox (kind, ref_id, recipient_id, dedupe_key)
    values ('reminder', new.reminder_id, new.recipient_id, 'reminder:' || new.id::text)
    on conflict (dedupe_key) where status = 'queued' do nothing;
  end if;
  return null;
end;
$$;

create or replace function private.queue_feedback_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.feature_enabled(new.team_id, 'email_feedback') then
    insert into public.email_outbox (kind, ref_id, dedupe_key)
    values ('feedback', new.id, 'feedback:' || new.id::text)
    on conflict (dedupe_key) where status = 'queued' do nothing;
  end if;
  return null;
end;
$$;

-- The meeting trigger returns early while email_meetings is off for the meeting's group.
create or replace function private.queue_meeting_email()
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
  if not private.feature_enabled(case when tg_op = 'DELETE' then old.team_id else new.team_id end, 'email_meetings') then
    return null;
  end if;

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
    if exists (select 1 from public.email_outbox o where o.dedupe_key = v_key and o.status = 'queued') then
      return null;
    end if;
    if new.series_id is not null then
      insert into public.email_outbox (kind, ref_id, dedupe_key, send_after)
      values ('series_changed', new.series_id, v_key || ':changed', now() + v_wait)
      on conflict (dedupe_key) where status = 'queued' do nothing;
    else
      insert into public.email_outbox (kind, ref_id, dedupe_key, send_after, payload)
      values ('meeting_changed', new.id, v_key || ':changed', now() + v_wait,
              jsonb_build_object('old_title', old.title, 'old_starts_at', old.starts_at, 'old_ends_at', old.ends_at))
      on conflict (dedupe_key) where status = 'queued' do nothing;
    end if;
    return null;
  end if;

  v_key := case when old.series_id is not null then 'series:' || old.series_id::text else 'meeting:' || old.id::text end;
  if old.ends_at <= now()
     or exists (select 1 from public.email_outbox o where o.dedupe_key = v_key and o.status = 'queued') then
    return null;
  end if;
  if not exists (select 1 from public.teams t where t.id = old.team_id)
     or (old.workspace_id is not null and not exists (select 1 from public.workspaces w where w.id = old.workspace_id)) then
    return null;
  end if;
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

-- At send time: anything whose sub-feature has been switched off since it was queued is skipped.
-- Runs before the claim's own selection, through a small wrapper so the claim itself stays as it was.
create function private.skip_switched_off_emails()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_outbox o set status = 'skipped'
  where o.status = 'queued' and o.send_after <= now()
    and not private.feature_enabled(
      case o.kind
        when 'reminder' then (select r.team_id from public.reminders r where r.id = o.ref_id)
        when 'feedback' then (select f.team_id from public.feedback f where f.id = o.ref_id)
        when 'meeting_cancelled' then (o.payload ->> 'team_id')::uuid
        when 'series_cancelled' then (o.payload ->> 'team_id')::uuid
        when 'meeting_created' then (select s.team_id from public.live_sessions s where s.id = o.ref_id)
        when 'meeting_changed' then (select s.team_id from public.live_sessions s where s.id = o.ref_id)
        else (select s.team_id from public.live_sessions s where s.series_id = o.ref_id limit 1)
      end,
      case o.kind
        when 'reminder' then 'email_reminders'
        when 'feedback' then 'email_feedback'
        else 'email_meetings'
      end);
$$;

revoke execute on function private.skip_switched_off_emails() from public, anon, authenticated;

-- The worker calls this first; it then claims as before.
create function public.email_prepare_batch()
returns void
language sql
security definer
set search_path = ''
as $$
  select private.skip_switched_off_emails();
$$;

revoke all on function public.email_prepare_batch() from public, anon, authenticated;
grant execute on function public.email_prepare_batch() to service_role;
