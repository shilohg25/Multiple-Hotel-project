-- Owner-managed room pricing, hotel-specific service catalog, reservation folio charges,
-- and price change history. This migration is intentionally additive so it can run
-- after the base schema or after the older pricing/remittance migration.

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
    select 1
    from pg_constraint
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
  changed_type text not null check (changed_type in ('room_price', 'service_price')),
  old_value numeric(12,2),
  new_value numeric(12,2),
  changed_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_items_hotel on public.service_items(hotel_id);
create index if not exists idx_reservation_charges_reservation on public.reservation_charges(reservation_id);
create index if not exists idx_reservation_charges_hotel on public.reservation_charges(hotel_id);
create index if not exists idx_price_change_logs_hotel_created on public.price_change_logs(hotel_id, created_at desc);

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'service_items_set_updated_at') then
      execute 'create trigger service_items_set_updated_at
        before update on public.service_items
        for each row execute function public.set_updated_at()';
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'reservation_charges_set_updated_at') then
      execute 'create trigger reservation_charges_set_updated_at
        before update on public.reservation_charges
        for each row execute function public.set_updated_at()';
    end if;
  end if;
end $$;

alter table public.service_items enable row level security;
alter table public.reservation_charges enable row level security;
alter table public.price_change_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_items' and policyname = 'staff can read service items'
  ) then
    execute 'create policy "staff can read service items" on public.service_items
      for select to authenticated
      using (public.can_access_hotel(hotel_id))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_items' and policyname = 'owners can manage service items'
  ) then
    execute 'create policy "owners can manage service items" on public.service_items
      for all to authenticated
      using (public.is_owner())
      with check (public.is_owner())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservation_charges' and policyname = 'staff can read reservation charges'
  ) then
    execute 'create policy "staff can read reservation charges" on public.reservation_charges
      for select to authenticated
      using (public.can_access_hotel(hotel_id))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservation_charges' and policyname = 'staff can create reservation charges'
  ) then
    execute 'create policy "staff can create reservation charges" on public.reservation_charges
      for insert to authenticated
      with check (
        public.can_access_hotel(hotel_id)
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role::text in (''owner'', ''manager'', ''front_desk'')
        )
      )';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservation_charges' and policyname = 'owners and managers can update reservation charges'
  ) then
    execute 'create policy "owners and managers can update reservation charges" on public.reservation_charges
      for update to authenticated
      using (
        public.can_access_hotel(hotel_id)
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role::text in (''owner'', ''manager'')
        )
      )
      with check (
        public.can_access_hotel(hotel_id)
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role::text in (''owner'', ''manager'')
        )
      )';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservation_charges' and policyname = 'owners can delete reservation charges'
  ) then
    execute 'create policy "owners can delete reservation charges" on public.reservation_charges
      for delete to authenticated
      using (
        public.can_access_hotel(hotel_id)
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role::text = ''owner''
        )
      )';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'price_change_logs' and policyname = 'staff can read price change logs'
  ) then
    execute 'create policy "staff can read price change logs" on public.price_change_logs
      for select to authenticated
      using (hotel_id is null or public.can_access_hotel(hotel_id))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'price_change_logs' and policyname = 'owners can insert price change logs'
  ) then
    execute 'create policy "owners can insert price change logs" on public.price_change_logs
      for insert to authenticated
      with check (public.is_owner())';
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
    select 1
    from public.service_items s
    where s.hotel_id = h.id
      and lower(s.name) = lower(d.name)
  );
