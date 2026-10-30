-- What each feature flag does, in full (owner's choice, 2026-10-30): the admin console shows it beside the
-- flag, so whoever switches one later knows exactly what changes for the group. `description` stays the
-- one-line summary; `details` is the longer explanation, one point per line (the console shows each line
-- as a bullet). Every new flag should come with its details.

alter table public.feature_flags
  add column details text not null default '' check (char_length(details) <= 2000);

comment on column public.feature_flags.details is
  'What turning the flag on or off does, for the admin console. One point per line.';

drop function public.admin_feature_flags();

create function public.admin_feature_flags()
returns table (
  key text,
  parent text,
  description text,
  details text,
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
  select f.key, f.parent, f.description, f.details, f.default_enabled, f.updated_at,
         coalesce((
           select jsonb_agg(jsonb_build_object('team_id', tf.team_id, 'enabled', tf.enabled))
           from public.team_feature_flags tf
           where tf.flag = f.key
         ), '[]'::jsonb)
  from public.feature_flags f
  order by coalesce(f.parent, f.key), f.parent is not null, f.key;
end;
$$;

revoke execute on function public.admin_feature_flags() from public, anon;
grant execute on function public.admin_feature_flags() to authenticated;

update public.feature_flags set details = $d$
On: an "Ask" button (⌘K / Ctrl+K) appears in the header for everyone in the group.
People ask in plain words, and Calsko AI reads and changes things for them: issues, notes, meetings, docs and chat messages.
It works with the person's own access: it can never see or do more than they could in the app themselves.
Anything that reaches other people (sending a chat message) waits for the person to confirm on a card.
Requests go to Google's Gemini model, as the privacy page says. Nothing loads or is sent until someone opens it.
Off: the button disappears and the server refuses the group's requests.
$d$ where key = 'ask_devdock';

update public.feature_flags set details = $d$
Shelved (2026-10-29): the Ninety sync was built on a branch and never shipped, so this flag currently changes nothing.
When it ships: issues, sprints and plans would be sent one way to Ninety (EOS) as To-Dos, Rocks, Headlines and Scorecard numbers.
$d$ where key = 'ninety_sync';

update public.feature_flags set details = $d$
The switch for all of Calsko's emails for this group. The parts below are switched one by one; they only work while this is on.
Off: no email of any kind goes out for the group (invites, reminders, feedback, meetings, chat), and emails already waiting are dropped.
Turning it back on restores each part as it was set.
All emails come from calsko.com (invites@ or notifications@), and replies go to support@calsko.com.
Limit: at most 90 recipients a day across every group (Resend's free plan allows 100); over that, emails wait for the next day.
$d$ where key = 'email';

update public.feature_flags set details = $d$
On: owners and admins see "Email invites" on Group → Members, next to "New invite".
They type up to 20 addresses; each person gets their own invite code (works once, expires in 7 days) and a link that opens the join page with the code filled in.
The emails come from invites@calsko.com; replies go to support@calsko.com. Addresses are not stored in Calsko.
Off: the button is hidden and the server refuses to send. Invite codes still work: they can be copied and shared by hand.
$d$ where key = 'email_invites';

update public.feature_flags set details = $d$
On: when a note with a time is due, its owner gets an email ("Reminder: …") with the note's text and a button to the note or its issue, as well as the pop-up and the bell in the app.
Notes without a time never email. Notes marked done or archived before the email goes are skipped.
Each person can switch these off for themselves: their name in the sidebar → Email → Note reminders.
Off: reminders only show in the app (pop-up and bell), as before.
$d$ where key = 'email_reminders';

update public.feature_flags set details = $d$
On: every piece of feedback someone in this group sends (header → their name → Send feedback) is emailed to support@calsko.com, which forwards it to the people set up in ImprovMX.
The email has the message, who sent it and their address, the group, the page they were on and their browser. Replying answers the sender directly.
Feedback from someone in no group follows this flag's default.
Off: feedback still arrives in the admin console (/admin → Feedback); it just isn't emailed.
$d$ where key = 'email_feedback';

update public.feature_flags set details = $d$
On: everyone in a meeting's audience (not the organizer) gets an email when a meeting is scheduled, changed (new time or title, with the old one crossed out) or cancelled.
The email shows the time in each person's own time zone, where it is, a button to the meeting and "Add to calendar" links (Google, Outlook).
A repeating meeting sends one email listing its dates. Emails wait 2 minutes, so quick edits become one email.
Meetings synced to Google Calendar ("Invites" on the meeting page) are skipped, because Google already emailed everyone. A meeting synced only after its Calsko email went out is emailed twice.
Each person can switch these off for themselves: their name → Email → Meeting invites and changes.
Off (the default): meeting invites only go out through Google Calendar.
$d$ where key = 'email_meetings';

update public.feature_flags set details = $d$
On: when someone gets a mention, a DM or group message, or a reply in a thread they're in, and still hasn't read it 30 minutes later, they get one email for that conversation.
The email lists the unread messages (the latest five, with names and times) and a button to the conversation. More messages in the same conversation while it waits join the same email.
Reading the conversation in Calsko before then cancels the email. Muted conversations never email. Calls aren't emailed.
Each person can switch these off for themselves: their name → Email → Unread chat messages.
Volume: in a busy group this is the email most likely to reach the daily limit (90 recipients a day).
Off (the default): chat only notifies in the app (bell and badges).
$d$ where key = 'email_chat';

-- Trim the blank first and last lines the dollar quotes leave.
update public.feature_flags set details = btrim(details, E'\n');
