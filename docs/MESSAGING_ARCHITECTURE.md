# DevDock Messaging Architecture

Status: Part 1 core completion and Part 2 attachment foundation
Date: 2026-10-03

This document is the decision record for built-in team messaging. It covers
the complete boundary needed by Parts 1 and 2, while the implementation in
this change is limited to the Part 1 scope described below.

## Verified repository facts

- The frontend is a React 19 + TypeScript + Vite SPA using React Router 7,
  TanStack Query 5, Tailwind v4, shadcn/ui, Supabase, and lucide-react.
- Authenticated routes are children of `appLoader`; `/t/:teamSlug` is guarded
  by `teamLoader`, which resolves membership through `myTeamsQuery`.
- Team roles are `owner`, `admin`, and `member`. RLS is the authority; the
  TypeScript permission helpers are UI hints only.
- Feature data access is in `src/features/<name>/api.ts`, with query options,
  mutations, and friendly `toDataError` handling. Components do not import the
  Supabase client directly.
- `startRealtimeSync` subscribes to one public Postgres Changes channel and
  invalidates query prefixes by table name. Reconnects invalidate the cache so
  durable rows recover missed events. Tables must also be added to the
  `supabase_realtime` publication.
- Existing SQL uses `private` security-definer membership helpers,
  `search_path = ''`, explicit grants, RLS, composite team/workspace foreign
  keys, and append-only migrations. `database.types.ts` is generated.
- Existing JaaS uses `live_sessions`, where `room_name` is intentionally not
  selected by the browser. `jaas-token` checks the caller under RLS and signs a
  short-lived provider token. The current model is scheduled sessions, not
  instant conversation calls.
- There is no test script or test framework in `package.json`. The repository's
  executable regression gates are `npm run typecheck`, `npm run lint`, and
  `npm run build`; prior database work uses local SQL scratchpad tests.
- No `AGENTS.md` or repository Copilot instruction file was present in the
  workspace at assessment time.

## Proposed feature boundary

Messaging is team-scoped. It does not reuse workspace visibility and does not
add private channels or cross-team conversations.

### Durable tables

Part 1 adds these tables. UUIDs remain opaque to callers.

- `conversations`: `id`, `team_id`, `kind` (`channel`, `dm`, `group`),
  `name`, `description`, `is_archived`, creator and timestamps. A team has
  exactly one idempotently-created `general` channel, represented by a unique
  `(team_id, kind, name)` constraint for channels.
- `conversation_members`: `(conversation_id, user_id)` primary key, team id,
  role (`owner` or `member`), join and optional leave timestamps. The team id
  is denormalized for indexed authorization and protected by composite foreign
  keys. Membership is the only authority for DMs and groups; team admins do
  not bypass it.
- `messages`: `id`, `conversation_id`, `team_id`, `author_id`, nullable
  `parent_id`, `client_id` (retry idempotency key), safe TipTap JSON `body`, a
  plain-text `content` copy, edited/deleted timestamps, and created timestamp.
  `parent_id` may point only to an original message in the same conversation;
  replies cannot have replies. A deleted row remains as a placeholder with a
  null body and a deletion marker so thread structure is stable.
- `message_reactions`: `(message_id, user_id, emoji)` primary key, with
  conversation/team columns for policy and index locality.
- `conversation_reads`: `(conversation_id, user_id)` with last read main
  message timestamp/id and last read thread timestamp/id. This is private to
  the user and is updated through an RPC.
- `conversation_preferences`: `(conversation_id, user_id)` with `all`,
  `mentions`, or `muted` notification mode and a following flag.
- `notifications`: recipient, team, optional conversation/message/thread
  references, kind, dedupe key, read timestamp, and created timestamp. It is
  recipient-only and uses a unique dedupe key.

Part 2 extension tables are intentionally not created in Part 1. Structured
message payloads use a future `message_attachments`/`message_extensions`
boundary rather than putting provider or storage fields into `messages`.
Candidate extension kinds are `attachment`, `poll`, `meeting_card`,
`internal_link`, and `document_conversion`; each must retain the parent
message's conversation/team authorization.

### Authorization rules

- Channel readers are current members of the same team and the channel is not
  archived for new activity. Existing channel history remains readable to
  newly joined team members.
- DM readers are exactly the two current participants. Group readers are
  current participants. A team role never grants private conversation access.
- All membership inserts verify both users are current members of the same
  team. Group management is owned by the creator initially; managers may add
  or remove participants and transfer management through an RPC. The UI must
  disclose that a newly added participant can read existing history.
- Removing a participant sets `left_at` or removes the membership row in one
  authorized transaction and immediately removes read/message/realtime access
  through the membership predicate. Removing a team member has the same effect
  through the team membership helper.
- Authors may edit or delete only their own messages. Managers do not edit
  another author's content. Reactions are self-owned toggles.
- Channel creation, rename, and archive are restricted to team owners/admins;
  archive is preferred to destructive deletion. The general channel cannot be
  archived.

Every table has explicit authenticated grants and RLS. Private helpers are
security definer with an empty search path and are not executable by anonymous
users. RPCs re-check authorization and are used when a write changes multiple
rows.

### Message format and ordering

The composer accepts a constrained TipTap schema matching existing docs:
paragraphs, bold, italic, bullet/ordered lists, links limited to `http`,
`https`, and `mailto`, inline code, and code blocks. The database stores JSON
after server-side shape/size validation plus a plain-text copy. Arbitrary HTML,
scripts, images, embeds, and provider payloads are excluded from Part 1.

History is fetched newest-first in pages using `(created_at, id)` as a stable
cursor, then rendered oldest-first. The pair is indexed and breaks timestamp
ties. New realtime events invalidate/refetch the durable query; the UI keeps a
user who is reading history anchored and shows a new-message indicator rather
than forcing a scroll. A permalink first loads pages until the target cursor
or reports that it is unavailable.

Clients generate a UUID `client_id` per send attempt. A unique
`(conversation_id, author_id, client_id)` constraint makes retries return the
existing message instead of duplicating it. The send RPC validates parent
ownership, inserts the message, and creates mention/follow notifications in
one transaction. Notification and reaction operations use unique keys so
reconnects are harmless.

### Threads, unread state, and notifications

Threads are one level: the parent is in the main timeline and replies are only
in the thread view. Authors and reply participants follow by default; explicit
follow/unfollow state is represented by `conversation_preferences` or a later
thread-follow table if per-thread controls require it. Thread replies notify
followers, mentions notify valid participants, DMs/groups notify by default,
and ordinary channel messages only advance unread state. Muting suppresses
alerts but does not suppress unread counts. Opening a thread marks only the
thread position; opening the conversation marks the main position.

Typing is transient Supabase Presence data with expiry. It is never persisted.
The existing generic realtime invalidation remains the recovery mechanism;
message UI subscriptions must always clean up on conversation change and
re-query after reconnect.

### Search

Search is a parameterized RPC over an indexed plain-text/tsvector projection
of messages. It filters by team and conversation, excludes deleted bodies,
joins only authorized conversations, includes replies, and returns a cursor,
author, conversation, and context snippet. It must not be implemented as a
client-side download or an unrestricted view.

### Instant calls and Part 2 contracts

The existing scheduled `live_sessions` table is not sufficient for an instant
private call because its audience is team/workspace scoped and its lifecycle
is schedule-driven. Part 1 therefore defines, but does not silently deploy,
the future `conversation_calls` record: conversation id, provider session id
or reference, initiator, `active|ended|failed|expired` state, started/ended
timestamps, and an idempotency key. A security-definer `start_conversation_call`
RPC must return the active call for concurrent starts, authorize current
participants, and create the structured call-card message atomically.
The JaaS token function must accept a call id, re-check current membership on
every token request, and never trust a room URL. Provider failure marks the
record failed and permits a retry; closing a browser does not end a call.
This preserves standalone scheduled Live sessions unchanged.

Part 2 will also add storage policies for attachments, server-validated poll
state, meeting-card references to live/call records, safe internal-link
targets, and a document conversion RPC that reads authorized message content.

## Dependency-ordered implementation plan

1. Add the migration, helpers, RLS, indexes, idempotent general-channel RPC,
   and publication entries. Add local SQL security tests for cross-team,
   private-admin, membership removal, duplicate DM, and message author rules.
2. Generate database types, then add the messaging API and query keys for
   conversations, paged messages, members, reactions, reads, preferences,
   notifications, and search. Keep Supabase imports inside API modules.
3. Add team navigation, routes/loaders, conversation list/filter/new dialog,
   and durable timeline/composer with drafts, retries, edit/delete, and
   permalink loading.
4. Add realtime invalidation prefixes, unread/read state, threads, reactions,
   pins, mentions, preferences, notifications, and search.
5. Add the separately reviewed conversation-call migration/function and wire
   the existing Jitsi dock only after token and membership checks are tested.
6. Run typecheck, lint, build, SQL security tests, and manual light/dark,
   mobile, keyboard, reconnect, and two-user checks.

## Current blockers and deployment notes

- The workspace has no configured test runner and no local Supabase test
  harness visible in the checked-in tree. SQL policy tests require the existing
  local Postgres/Supabase setup or an explicitly approved test harness.
- No messaging migration or call function has been deployed by this change.
  Production requires review, `supabase db push`, `npm run db:types`, and
  function deployment only after explicit approval.
- Real JaaS instant-call behavior cannot be verified without the existing
  Edge Function secrets and a configured provider; no public-room fallback is
  acceptable.

## Implemented in this change

- The architecture record, durable messaging tables, membership-based RLS,
  explicit grants, realtime publication entries, general-channel bootstrap,
  channel/group/DM creation RPCs, concurrent DM serialization, and idempotent
  message-send RPC.
- A team-level Messages route with conversation filtering, creation dialogs,
  durable parent-message history, cursor-aware API queries, session-preserved
  drafts, and retry-safe sending. Workspace navigation is unchanged.
- Realtime cache invalidation entries for messaging tables.

## Not yet implemented

The following remain required before calling Part 1 complete: thread UI and
thread-follow state, reactions, pins, read positions and unread indicators,
notification records/preferences and mention validation, authorized search,
message edit/delete controls, permalink pagination, typing Presence, and the
conversation-call record/token integration. The schema and RPC boundary above
are intended to support these slices without changing private access rules.

## Part 2 prerequisite audit (2026-10-04)

The supplied Part 1 prerequisite was not initially satisfied. The current
repository now includes the first core completion slice, but the full Part 1
checklist is still not complete.
This audit is based on the checked-in messaging API, Messages route, SQL
migrations through `20261004110000`, realtime map, and the available
`typecheck`/`lint` checks.

Implemented and verified: team-scoped channels, DMs and named groups; RLS
membership checks; idempotent DM/message RPCs; basic persistent timeline and
drafts; realtime invalidation; team member names/initials; DM/group message
notifications; duplicate-group prompt; group member history cutoffs enforced
by message RLS; Enter/Shift+Enter composer behavior.

The core completion slice now includes one-level inline thread replies,
author edit/delete controls with deletion placeholders, reaction toggling,
manager pin controls, active-conversation read marking, and an authorized
search RPC contract. These are backed by migration
`20261004120000_complete_part1_core.sql`.

Remaining blockers: thread follow state, unread counts and recovery UI, mention
parsing/validation, a search UI/permalink navigation, typing Presence,
notification preferences, and conversation instant-call records and JaaS
authorization. The current notification trigger only handles new
DM/group messages and does not implement mentions, thread followers, or mute
preferences. The current timeline renders plain text and does not render the
declared safe rich-message format.

Part 2 has started with `20261004130000_message_attachments.sql`: a private
10 MB bucket, exact image/PDF/text/CSV/Office allowlist, message-linked
metadata, independent Storage RLS, and cleanup on metadata-registration
failure. The composer now supports up to five validated files and downloads
through five-minute signed URLs; uploads are still sequential and do not claim
malware scanning. Migration `20261004140000_message_mentions.sql` adds
participant-validated mention IDs and deduplicated mention notifications.
Replies remain collapsed by default, and thread/reaction/pin/edit/delete UI is
implemented in the timeline.

The composer now has a resource picker for authorized team-visible Docs,
Diagrams, Live sessions, and Issues. It inserts canonical internal URLs into
the message; destination loaders/RLS remain authoritative. Local files remain
available from the same picker. Team-wide server search is available from the
Messages sidebar and searches only authorized, non-deleted message content.
The reaction bar supports eight named emoji toggles, and replies display a
collapsed `View replies (N)` affordance.

Polls, meetings, canonical links/cards, document export, attachment previews,
upload progress/cancel, thread follow state, typing Presence, notification
preferences, and conversation instant calls remain to be implemented.
Copy-link buttons across existing modules and authorized metadata preview cards
are also still pending; plain shared internal URLs are clickable today but do
not yet unfurl titles or descriptions.
