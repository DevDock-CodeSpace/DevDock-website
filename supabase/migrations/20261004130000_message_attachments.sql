-- Part 2 foundation: private attachments linked to authorized messages.
-- Object path: <team_id>/<conversation_id>/<message_id>/<uuid>.<extension>

alter table public.messages add constraint messages_id_conversation_key unique (id, conversation_id);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  uploaded_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size integer not null,
  created_at timestamptz not null default now(),
  constraint message_attachments_name_length check (char_length(file_name) between 1 and 255),
  constraint message_attachments_size check (file_size between 1 and 10485760),
  constraint message_attachments_type check (mime_type in (
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )),
  constraint message_attachments_message_conversation_fkey
    foreign key (message_id, conversation_id) references public.messages(id, conversation_id) on delete cascade
);

create index message_attachments_message_idx on public.message_attachments (message_id, created_at);
revoke all on table public.message_attachments from anon, authenticated;
grant select, insert on public.message_attachments to authenticated;
alter table public.message_attachments enable row level security;
create policy "Conversation members can read attachments"
  on public.message_attachments for select to authenticated
  using (private.can_read_message(message_id, conversation_id, (select created_at from public.messages where id = message_id)));
create policy "Conversation members can register attachments"
  on public.message_attachments for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and private.can_read_conversation(conversation_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.conversation_id = conversation_id and m.author_id = (select auth.uid()))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments', 'message-attachments', false, 10485760,
  array[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do nothing;

create function private.can_access_message_attachment(object_name text, for_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.messages m
    where m.team_id = private.to_uuid((storage.foldername(object_name))[1])
      and m.conversation_id = private.to_uuid((storage.foldername(object_name))[2])
      and m.id = private.to_uuid((storage.foldername(object_name))[3])
      and case when for_write
        then m.author_id = (select auth.uid()) and private.can_read_conversation(m.conversation_id)
        else private.can_read_message(m.id, m.conversation_id, m.created_at)
      end
  );
$$;
revoke all on function private.can_access_message_attachment(text, boolean) from public, anon, authenticated;
grant execute on function private.can_access_message_attachment(text, boolean) to authenticated;

create policy "Authorized members can view message attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'message-attachments' and private.can_access_message_attachment(name, false));
create policy "Message authors can upload attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'message-attachments' and private.can_access_message_attachment(name, true));
create policy "Message authors can delete attachments"
  on storage.objects for delete to authenticated
  using (bucket_id = 'message-attachments' and private.can_access_message_attachment(name, true));
