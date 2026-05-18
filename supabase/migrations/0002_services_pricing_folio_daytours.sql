-- Complete operational foundation for pricing, folios, remittances, outlets,
-- and day tours. Safe to run once in Supabase SQL Editor after 0001_schema.sql.

create extension if not exists pgcrypto;

create table if not exists public.outlets (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid references public.hotels(id) on delete cascade,
  name text not null,
  slug text not null,
  outlet_type text not null default 'hotel',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hotel_id, slug)
);

alter table public.outlets add column if not exists hotel_id uuid references public.hotels(id) on delete cascade;
alter table public.outlets add column if not exists outlet_type text not null default 'hotel';
alter table public.outlets add column if not exists active boolean not null default true;

create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  default_price numeric(12,2) not null default 0,
  active boolean not null default true,
  remittance_required boolean not null default false,
  remittance_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_items add column if not exists description text;
alter table public.service_items add column if not exists remittance_note text;
alter table public.service_items add column if not exists created_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_items_hotel_id_name_key'
      and conrelid = 'public.service_items'::regclass
  ) then
    execute 'alter table public.service_items add constraint service_items_hotel_id_name_key unique (hotel_id, name)';
  end if;
end $$;

create table if not exists public.reservation_charges (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  service_item_id uuid references public.service_items(id) on delete set null,
  description text not null,
  category text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  remittance_required boolean not null default false,
  remittance_note text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reservation_charges add column if not exists remittance_note text;

create table if not exists public.price_change_logs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid references public.hotels(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  service_item_id uuid references public.service_items(id) on delete set null,
  changed_type text not null,
  old_value numeric(12,2),
  new_value numeric(12,2),
  changed_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.remittances (
  id uuid primary key default gen_random_uuid(),
  from_hotel_id uuid not null references public.hotels(id) on delete cascade,
  to_outlet_id uuid references public.outlets(id) on delete set null,
  period_start date not null,
  period_end date not null,
  amount_due numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  status text not null default 'pending',
  paid_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.day_tour_packages (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  name text not null,
  description text,
  adult_price numeric(12,2) not null default 0,
  child_price numeric(12,2) not null default 0,
  capacity_per_day int,
  breakfast_included boolean not null default false,
  lunch_included boolean not null default false,
  restaurant_remittance_per_guest numeric(12,2) not null default 0,
  remittance_outlet_id uuid references public.outlets(id) on delete set null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hotel_id, name)
);

alter table public.day_tour_packages add column if not exists created_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'day_tour_packages_hotel_id_name_key'
      and conrelid = 'public.day_tour_packages'::regclass
  ) then
    execute 'alter table public.day_tour_packages add constraint day_tour_packages_hotel_id_name_key unique (hotel_id, name)';
  end if;
end $$;

create table if not exists public.day_tour_bookings (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  package_id uuid references public.day_tour_packages(id) on delete set null,
  guest_name text not null,
  guest_email text,
  guest_phone text,
  tour_date date not null,
  adult_count int not null default 0,
  child_count int not null default 0,
  total_amount numeric(12,2) not null default 0,
  downpayment_required numeric(12,2) not null default 0,
  status text not null default 'tentative',
  payment_details text,
  proof_path text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.day_tour_bookings alter column package_id drop not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'day_tour_bookings_package_id_fkey'
      and conrelid = 'public.day_tour_bookings'::regclass
  ) then
    execute 'alter table public.day_tour_bookings drop constraint day_tour_bookings_package_id_fkey';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'day_tour_bookings_package_id_set_null_fkey'
      and conrelid = 'public.day_tour_bookings'::regclass
  ) then
    execute 'alter table public.day_tour_bookings add constraint day_tour_bookings_package_id_set_null_fkey foreign key (package_id) references public.day_tour_packages(id) on delete set null';
  end if;
end $$;

create table if not exists public.day_tour_payments (
  id uuid primary key default gen_random_uuid(),
  day_tour_booking_id uuid not null references public.day_tour_bookings(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  method text not null default 'other',
  payer_name text,
  payment_reference text,
  payment_details text not null,
  proof_path text,
  proof_original_name text,
  status text not null default 'submitted',
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.remittance_items (
  id uuid primary key default gen_random_uuid(),
  remittance_id uuid not null references public.remittances(id) on delete cascade,
  reservation_charge_id uuid references public.reservation_charges(id) on delete set null,
  day_tour_booking_id uuid references public.day_tour_bookings(id) on delete set null,
  description text,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.remittance_items add column if not exists day_tour_booking_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'remittance_items_day_tour_booking_id_fkey'
      and conrelid = 'public.remittance_items'::regclass
  ) then
    execute 'alter table public.remittance_items add constraint remittance_items_day_tour_booking_id_fkey foreign key (day_tour_booking_id) references public.day_tour_bookings(id) on delete set null';
  end if;
end $$;

create index if not exists idx_service_items_hotel on public.service_items(hotel_id);
create index if not exists idx_reservation_charges_reservation on public.reservation_charges(reservation_id);
create index if not exists idx_reservation_charges_hotel on public.reservation_charges(hotel_id);
create index if not exists idx_price_change_logs_hotel_created on public.price_change_logs(hotel_id, created_at desc);
create index if not exists idx_outlets_hotel on public.outlets(hotel_id);
create index if not exists idx_remittances_hotel_period on public.remittances(from_hotel_id, period_start, period_end);
create index if not exists idx_remittance_items_remittance on public.remittance_items(remittance_id);
create index if not exists idx_day_tour_packages_hotel on public.day_tour_packages(hotel_id);
create index if not exists idx_day_tour_bookings_hotel_date on public.day_tour_bookings(hotel_id, tour_date);
create index if not exists idx_day_tour_payments_booking on public.day_tour_payments(day_tour_booking_id);

do $$
declare
  table_name text;
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    foreach table_name in array array[
      'service_items',
      'reservation_charges',
      'outlets',
      'remittances',
      'day_tour_packages',
      'day_tour_bookings',
      'day_tour_payments'
    ] loop
      if not exists (select 1 from pg_trigger where tgname = table_name || '_set_updated_at') then
        execute format(
          'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
          table_name || '_set_updated_at',
          table_name
        );
      end if;
    end loop;
  end if;
end $$;

alter table public.service_items enable row level security;
alter table public.reservation_charges enable row level security;
alter table public.price_change_logs enable row level security;
alter table public.outlets enable row level security;
alter table public.remittances enable row level security;
alter table public.remittance_items enable row level security;
alter table public.day_tour_packages enable row level security;
alter table public.day_tour_bookings enable row level security;
alter table public.day_tour_payments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_items' and policyname = 'staff can read service items') then
    execute 'create policy "staff can read service items" on public.service_items for select to authenticated using (public.can_access_hotel(hotel_id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_items' and policyname = 'owners can manage service items') then
    execute 'create policy "owners can manage service items" on public.service_items for all to authenticated using (public.is_owner()) with check (public.is_owner())';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservation_charges' and policyname = 'staff can read reservation charges') then
    execute 'create policy "staff can read reservation charges" on public.reservation_charges for select to authenticated using (public.can_access_hotel(hotel_id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservation_charges' and policyname = 'staff can create reservation charges') then
    execute 'create policy "staff can create reservation charges" on public.reservation_charges for insert to authenticated with check (public.can_access_hotel(hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in (''owner'', ''manager'', ''front_desk'')))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservation_charges' and policyname = 'owners and managers can update reservation charges') then
    execute 'create policy "owners and managers can update reservation charges" on public.reservation_charges for update to authenticated using (public.can_access_hotel(hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in (''owner'', ''manager''))) with check (public.can_access_hotel(hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in (''owner'', ''manager'')))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservation_charges' and policyname = 'owners can delete reservation charges') then
    execute 'create policy "owners can delete reservation charges" on public.reservation_charges for delete to authenticated using (public.can_access_hotel(hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = ''owner''))';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'price_change_logs' and policyname = 'staff can read price change logs') then
    execute 'create policy "staff can read price change logs" on public.price_change_logs for select to authenticated using (hotel_id is null or public.can_access_hotel(hotel_id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'price_change_logs' and policyname = 'owners can insert price change logs') then
    execute 'create policy "owners can insert price change logs" on public.price_change_logs for insert to authenticated with check (public.is_owner())';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outlets' and policyname = 'staff can read outlets') then
    execute 'create policy "staff can read outlets" on public.outlets for select to authenticated using (hotel_id is null or public.can_access_hotel(hotel_id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outlets' and policyname = 'owners can manage outlets') then
    execute 'create policy "owners can manage outlets" on public.outlets for all to authenticated using (public.is_owner()) with check (public.is_owner())';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'remittances' and policyname = 'staff can read remittances') then
    execute 'create policy "staff can read remittances" on public.remittances for select to authenticated using (public.can_access_hotel(from_hotel_id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'remittances' and policyname = 'owners and managers can manage remittances') then
    execute 'create policy "owners and managers can manage remittances" on public.remittances for all to authenticated using (public.can_access_hotel(from_hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in (''owner'', ''manager''))) with check (public.can_access_hotel(from_hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in (''owner'', ''manager'')))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'remittance_items' and policyname = 'owners and managers can read remittance items') then
    execute 'create policy "owners and managers can read remittance items" on public.remittance_items for select to authenticated using (exists (select 1 from public.remittances r where r.id = remittance_id and public.can_access_hotel(r.from_hotel_id)))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'remittance_items' and policyname = 'owners and managers can manage remittance items') then
    execute 'create policy "owners and managers can manage remittance items" on public.remittance_items for all to authenticated using (exists (select 1 from public.remittances r join public.profiles p on p.id = auth.uid() where r.id = remittance_id and public.can_access_hotel(r.from_hotel_id) and p.role::text in (''owner'', ''manager''))) with check (exists (select 1 from public.remittances r join public.profiles p on p.id = auth.uid() where r.id = remittance_id and public.can_access_hotel(r.from_hotel_id) and p.role::text in (''owner'', ''manager'')))';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'day_tour_packages' and policyname = 'staff can read day tour packages') then
    execute 'create policy "staff can read day tour packages" on public.day_tour_packages for select to authenticated using (public.can_access_hotel(hotel_id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'day_tour_packages' and policyname = 'owners and managers can manage day tour packages') then
    execute 'create policy "owners and managers can manage day tour packages" on public.day_tour_packages for all to authenticated using (public.can_access_hotel(hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in (''owner'', ''manager''))) with check (public.can_access_hotel(hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in (''owner'', ''manager'')))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'day_tour_bookings' and policyname = 'staff can read day tour bookings') then
    execute 'create policy "staff can read day tour bookings" on public.day_tour_bookings for select to authenticated using (public.can_access_hotel(hotel_id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'day_tour_bookings' and policyname = 'staff can create day tour bookings') then
    execute 'create policy "staff can create day tour bookings" on public.day_tour_bookings for insert to authenticated with check (public.can_access_hotel(hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in (''owner'', ''manager'', ''front_desk'')))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'day_tour_bookings' and policyname = 'owners and managers can update day tour bookings') then
    execute 'create policy "owners and managers can update day tour bookings" on public.day_tour_bookings for update to authenticated using (public.can_access_hotel(hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in (''owner'', ''manager''))) with check (public.can_access_hotel(hotel_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text in (''owner'', ''manager'')))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'day_tour_bookings' and policyname = 'owners can delete day tour bookings') then
    execute 'create policy "owners can delete day tour bookings" on public.day_tour_bookings for delete to authenticated using (public.can_access_hotel(hotel_id) and public.is_owner())';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'day_tour_payments' and policyname = 'staff can manage day tour payments') then
    execute 'create policy "staff can manage day tour payments" on public.day_tour_payments for all to authenticated using (public.can_access_hotel(hotel_id)) with check (public.can_access_hotel(hotel_id))';
  end if;
end $$;

with default_services(name, category, default_price) as (
  values
    ('Breakfast', 'breakfast', 0::numeric),
    ('Extra bed', 'extra_bed', 0::numeric),
    ('Chauffeur', 'chauffeur', 0::numeric),
    ('Airport pickup', 'airport_pickup', 0::numeric),
    ('Airport drop-off', 'airport_dropoff', 0::numeric),
    ('Late checkout', 'late_checkout', 0::numeric),
    ('Early check-in', 'early_checkin', 0::numeric),
    ('Laundry', 'laundry', 0::numeric),
    ('Corkage', 'corkage', 0::numeric),
    ('Damage charge', 'damage', 0::numeric),
    ('Lost key', 'lost_key', 0::numeric),
    ('Extra towel', 'extra_towel', 0::numeric),
    ('Extra person', 'extra_person', 0::numeric),
    ('Day tour', 'day_tour', 0::numeric),
    ('Other', 'other', 0::numeric)
)
insert into public.service_items (hotel_id, name, category, default_price, active, remittance_required)
select h.id, d.name, d.category, d.default_price, true, false
from public.hotels h
cross join default_services d
where h.active is true
  and not exists (
    select 1 from public.service_items s
    where s.hotel_id = h.id and lower(s.name) = lower(d.name)
  );

insert into public.outlets (hotel_id, name, slug, outlet_type, active)
select h.id, h.name, 'hotel', 'hotel', true
from public.hotels h
where not exists (
  select 1 from public.outlets o
  where o.hotel_id = h.id and o.slug = 'hotel'
);

insert into public.outlets (hotel_id, name, slug, outlet_type, active)
select h.id, h.name || ' Restaurant', 'restaurant', 'restaurant', true
from public.hotels h
where not exists (
  select 1 from public.outlets o
  where o.hotel_id = h.id and o.slug = 'restaurant'
);

create or replace view public.v_reservation_folio_totals as
select
  r.id as reservation_id,
  r.hotel_id,
  r.total_amount as room_total,
  coalesce(sum(rc.total_amount), 0)::numeric(12,2) as additional_charges_total,
  (r.total_amount + coalesce(sum(rc.total_amount), 0))::numeric(12,2) as display_total
from public.reservations r
left join public.reservation_charges rc on rc.reservation_id = r.id
group by r.id, r.hotel_id, r.total_amount;

create or replace view public.v_remittance_due_items as
select
  rc.id as reservation_charge_id,
  rc.hotel_id,
  rc.reservation_id,
  rc.description,
  rc.category,
  rc.total_amount,
  rc.remittance_note,
  rc.created_at
from public.reservation_charges rc
where rc.remittance_required is true;

create or replace view public.v_day_tour_capacity as
select
  p.id as package_id,
  p.hotel_id,
  p.name,
  b.tour_date,
  p.capacity_per_day,
  coalesce(sum(case when b.status in ('secured', 'completed') then b.adult_count + b.child_count else 0 end), 0) as secured_guest_count
from public.day_tour_packages p
left join public.day_tour_bookings b on b.package_id = p.id
group by p.id, p.hotel_id, p.name, b.tour_date, p.capacity_per_day;
