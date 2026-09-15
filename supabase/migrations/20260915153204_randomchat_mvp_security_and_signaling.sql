-- 20260915153204_randomchat_mvp_security_and_signaling.sql
revoke execute on function public.find_match() from public;
revoke execute on function public.find_match() from anon;
grant execute on function public.find_match() to authenticated;
revoke execute on function public.end_chat(uuid) from public;
revoke execute on function public.end_chat(uuid) from anon;
grant execute on function public.end_chat(uuid) to authenticated;
revoke execute on function public.leave_match_queue() from public;
revoke execute on function public.leave_match_queue() from anon;
grant execute on function public.leave_match_queue() to authenticated;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
grant execute on function public.handle_new_user() to authenticated;

create table if not exists public.call_events (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('started','ended')),
  created_at timestamptz not null default now()
);
create index if not exists call_events_chat_created_idx on public.call_events(chat_id, created_at desc);
alter table public.call_events enable row level security;
drop policy if exists call_events_select_participant on public.call_events;
create policy call_events_select_participant on public.call_events for select to authenticated using (exists (select 1 from public.chats c where c.id=call_events.chat_id and auth.uid() in(c.user_a,c.user_b)));
drop policy if exists call_events_insert_participant on public.call_events;
create policy call_events_insert_participant on public.call_events for insert to authenticated with check (sender_id=auth.uid() and exists (select 1 from public.chats c where c.id=call_events.chat_id and c.status='active' and auth.uid() in(c.user_a,c.user_b)));

do $$ begin
  alter publication supabase_realtime add table public.call_events;
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public) values ('chat-files','chat-files',false) on conflict (id) do nothing;
drop policy if exists chat_files_select_participant on storage.objects;
create policy chat_files_select_participant on storage.objects for select to authenticated using (bucket_id='chat-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists chat_files_insert_own on storage.objects;
create policy chat_files_insert_own on storage.objects for insert to authenticated with check (bucket_id='chat-files' and (storage.foldername(name))[1] = auth.uid()::text);
