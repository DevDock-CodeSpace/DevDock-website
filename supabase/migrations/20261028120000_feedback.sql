-- Feedback (owner's choice, 2026-10-28): anyone signed in can tell us about a problem or an idea from the
-- header's Feedback button. It reaches the platform admin's console (/admin → Feedback, with a count of
-- new ones). There is no email yet; when there is, the same rows can be sent on.
--
-- Nobody reads or writes the table directly: people send through send_feedback() (which stamps who sent
-- it and limits how many), and only platform admins read it, through admin_feedback(). A sender doesn't
-- get their feedback back, so the app holds no list of it.

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  -- Kept when the account goes: the feedback is still worth reading.
  user_id     uuid references auth.users (id) on delete set null,
  team_id     uuid references public.teams (id) on delete set null,
  kind        text not null check (kind in ('problem', 'idea', 'other')),
  message     text not null check (char_length(btrim(message)) between 1 and 5000),
  -- Where they were (path and query), and the browser and screen size: helps reproduce a problem.
  page        text check (char_length(page) <= 500),
  context     jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 2000),
  status      text not null default 'new' check (status in ('new', 'done')),
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);

create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_user_created_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

-- Sends one piece of feedback as the signed-in person. The group is kept only if they're in it. At most
-- 20 a day per person, so a stuck script or a bored hand can't fill the table.
create function public.send_feedback(p_kind text, p_message text, p_page text, p_team uuid, p_context jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'Sign in to send feedback' using errcode = '42501';
  end if;
  if (select count(*) from public.feedback f where f.user_id = v_user and f.created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of feedback for one day. Please try again tomorrow.' using errcode = 'P0001';
  end if;
  insert into public.feedback (user_id, team_id, kind, message, page, context)
  values (
    v_user,
    case when p_team is not null and private.is_team_member(p_team) then p_team end,
    p_kind,
    btrim(p_message),
    left(p_page, 500),
    coalesce(p_context, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.send_feedback(text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.send_feedback(text, text, text, uuid, jsonb) to authenticated;

-- The console's Feedback page: newest first, with who sent it (name and email, as the Users page shows)
-- and from which group. At most the latest 500; that is years of feedback at this size.
create function public.admin_feedback()
returns table (
  id          uuid,
  kind        text,
  message     text,
  page        text,
  context     jsonb,
  status      text,
  created_at  timestamptz,
  done_at     timestamptz,
  sender_id   uuid,
  sender_name text,
  sender_email text,
  team_name   text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
    select f.id, f.kind, f.message, f.page, f.context, f.status, f.created_at, f.done_at,
           f.user_id, p.display_name, u.email::text, t.name
    from public.feedback f
    left join public.profiles p on p.id = f.user_id
    left join auth.users u on u.id = f.user_id
    left join public.teams t on t.id = f.team_id
    order by f.created_at desc
    limit 500;
end;
$$;

revoke execute on function public.admin_feedback() from public, anon;
grant execute on function public.admin_feedback() to authenticated;

-- Marks feedback done (or new again).
create function public.admin_set_feedback_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  if p_status not in ('new', 'done') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.feedback
     set status = p_status,
         done_at = case when p_status = 'done' then now() end
   where id = p_id;
  if not found then
    raise exception 'That feedback no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_set_feedback_status(uuid, text) from public, anon;
grant execute on function public.admin_set_feedback_status(uuid, text) to authenticated;
