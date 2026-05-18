-- Lean offline sync idempotency support.
-- Prevents duplicate creates when staff clicks Sync Now more than once.

create table if not exists public.offline_sync_requests (
  id uuid primary key default gen_random_uuid(),
  client_request_id text not null unique,
  request_type text not null,
  server_table text,
  server_id uuid,
  status text not null default 'processed',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_offline_sync_requests_created_by on public.offline_sync_requests(created_by);

alter table public.offline_sync_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'offline_sync_requests'
      and policyname = 'staff can read own offline sync requests'
  ) then
    execute 'create policy "staff can read own offline sync requests" on public.offline_sync_requests for select to authenticated using (created_by = auth.uid() or public.is_owner())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'offline_sync_requests'
      and policyname = 'staff can insert own offline sync requests'
  ) then
    execute 'create policy "staff can insert own offline sync requests" on public.offline_sync_requests for insert to authenticated with check (created_by = auth.uid())';
  end if;
end $$;
