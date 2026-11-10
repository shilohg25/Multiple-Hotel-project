-- PR1.2 room types and channel rates.
-- Additive. Re-running does not overwrite a rate a manager has already changed.
-- Requires room_types and rooms from 0001_schema.sql.

create table if not exists public.room_type_channel_rates (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.room_types(id) on delete cascade,
  channel text not null check (channel in ('walk_in', 'ota', 'short_time')),
  rate numeric(12,2) not null check (rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_type_id, channel)
);

create table if not exists public.rate_override_requests (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  room_type_id uuid references public.room_types(id) on delete set null,
  channel text not null,
  requested_rate numeric(12,2) not null check (requested_rate >= 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_channel_rates_room_type on public.room_type_channel_rates(room_type_id);
create index if not exists idx_rate_overrides_hotel on public.rate_override_requests(hotel_id, status);

alter table public.room_type_channel_rates enable row level security;
alter table public.rate_override_requests enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'room_type_channel_rates' and policyname = 'staff can read channel rates') then
    execute 'create policy "staff can read channel rates" on public.room_type_channel_rates for select to authenticated using (exists (select 1 from public.room_types rt where rt.id = room_type_id and public.can_access_hotel(rt.hotel_id)))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_override_requests' and policyname = 'staff can read rate overrides') then
    execute 'create policy "staff can read rate overrides" on public.rate_override_requests for select to authenticated using (public.can_access_hotel(hotel_id))';
  end if;
end $$;

insert into public.room_types (hotel_id, name, description, base_rate, capacity, active)
select h.id, v.name, v.description, v.base_rate, v.capacity, true
from public.hotels h
join (
  values
    ('Deluxe Queen', 'Walk-in assumption from the daily sheet. OTA is stored separately.', 2250::numeric, 2),
    ('Deluxe Twin', 'Walk-in assumption from the daily sheet.', 2475::numeric, 2),
    ('Deluxe King', 'Matches the current Regular room rate of 2500.', 2500::numeric, 2),
    ('Barkada', 'Group room. Included pax assumption is 4. Rate is a placeholder.', 2500::numeric, 4)
) as v(name, description, base_rate, capacity) on true
where h.slug = 'navarro-hotel'
on conflict (hotel_id, name) do nothing;

insert into public.room_type_channel_rates (room_type_id, channel, rate)
select rt.id, v.channel, v.rate
from public.room_types rt
join public.hotels h on h.id = rt.hotel_id
join (
  values
    ('Deluxe Queen', 'walk_in', 2250::numeric),
    ('Deluxe Queen', 'ota', 2520::numeric),
    ('Deluxe Queen', 'short_time', 1500::numeric),
    ('Deluxe Twin', 'walk_in', 2475::numeric),
    ('Deluxe Twin', 'ota', 2750::numeric),
    ('Deluxe Twin', 'short_time', 1500::numeric),
    ('Deluxe King', 'walk_in', 2500::numeric),
    ('Deluxe King', 'ota', 2800::numeric),
    ('Deluxe King', 'short_time', 1500::numeric),
    ('Barkada', 'walk_in', 2500::numeric),
    ('Barkada', 'ota', 2800::numeric),
    ('Barkada', 'short_time', 1500::numeric)
) as v(name, channel, rate) on v.name = rt.name
where h.slug = 'navarro-hotel'
on conflict (room_type_id, channel) do nothing;

insert into public.room_types (hotel_id, name, base_rate, capacity, active)
select r.hotel_id, r.room_type_name, max(r.base_rate), max(r.capacity), true
from public.rooms r
join public.hotels h on h.id = r.hotel_id
where h.slug = 'tagosilangan'
  and coalesce(r.room_type_name, '') <> ''
group by r.hotel_id, r.room_type_name
on conflict (hotel_id, name) do nothing;

insert into public.room_type_channel_rates (room_type_id, channel, rate)
select rt.id, ch.channel, rt.base_rate
from public.room_types rt
join public.hotels h on h.id = rt.hotel_id
cross join (values ('walk_in'), ('ota')) as ch(channel)
where h.slug = 'tagosilangan'
on conflict (room_type_id, channel) do nothing;

update public.rooms r
set
  room_type_id = rt.id,
  room_type_name = rt.name
from public.hotels h, public.room_types rt
where r.hotel_id = h.id
  and h.slug = 'navarro-hotel'
  and rt.hotel_id = h.id
  and rt.name = 'Deluxe King'
  and r.room_type_id is null
  and coalesce(r.room_type_name, 'Regular') = 'Regular';

update public.rooms r
set room_type_id = rt.id
from public.room_types rt
where rt.hotel_id = r.hotel_id
  and rt.name = r.room_type_name
  and r.room_type_id is null;
