-- 20260915190000_safety_reports_and_blocking.sql
create table if not exists public.blocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  check (user_id <> blocked_user_id)
);

alter table public.blocks enable row level security;
drop policy if exists blocks_select_own on public.blocks;
create policy blocks_select_own on public.blocks for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks for insert to authenticated
  with check ((select auth.uid()) = user_id and user_id <> blocked_user_id);
drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.blocks to authenticated;

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  chat_id uuid references public.chats(id) on delete set null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);

create index if not exists reports_reported_created_idx on public.reports(reported_user_id, created_at desc);

alter table public.reports enable row level security;
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id and reporter_id <> reported_user_id);
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports for select to authenticated
  using ((select auth.uid()) = reporter_id);

grant select, insert on public.reports to authenticated;

create or replace function public.find_match()
returns public.chats
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  other_user uuid;
  result public.chats;
begin
  if me is null then raise exception 'Not authenticated'; end if;

  delete from public.match_queue where user_id = me;
  insert into public.match_queue(user_id) values (me);

  select q.user_id into other_user
  from public.match_queue q
  where q.user_id <> me
    and not exists (
      select 1 from public.blocks b
      where b.user_id = me and b.blocked_user_id = q.user_id
    )
    and not exists (
      select 1 from public.blocks b
      where b.user_id = q.user_id and b.blocked_user_id = me
    )
  order by q.joined_at
  for update skip locked
  limit 1;

  if other_user is null then return null; end if;

  delete from public.match_queue where user_id in (me, other_user);
  insert into public.chats(user_a, user_b) values (me, other_user) returning * into result;
  return result;
end;
$$;

revoke execute on function public.find_match() from public;
revoke execute on function public.find_match() from anon;
grant execute on function public.find_match() to authenticated;
