-- PR1.5 check-in and check-out hours.
-- Fills the clock only when it is still empty. Hourly rates default to 200.

alter table public.hotels
  add column if not exists early_checkin_hourly_rate numeric(12,2) not null default 200;

alter table public.hotels
  add column if not exists late_checkout_hourly_rate numeric(12,2) not null default 200;

update public.hotels
set check_in_time = '14:00'
where check_in_time is null;

update public.hotels
set check_out_time = '12:00'
where check_out_time is null;

create table if not exists public.stay_time_requests (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  kind text not null check (kind in ('early_check_in', 'late_check_out')),
  hours numeric(8,2) not null check (hours > 0),
  hourly_rate numeric(12,2) not null check (hourly_rate >= 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_stay_time_requests_reservation on public.stay_time_requests(reservation_id, status);
alter table public.stay_time_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stay_time_requests' and policyname = 'staff can read stay time requests'
  ) then
    execute 'create policy "staff can read stay time requests" on public.stay_time_requests for select to authenticated using (public.can_access_hotel(hotel_id))';
  end if;
end $$;
