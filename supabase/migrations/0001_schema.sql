-- Hotel booking app schema
-- Run in Supabase SQL editor or with: supabase db push

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.app_role as enum ('owner', 'manager', 'front_desk', 'accounting');
create type public.reservation_status as enum (
  'tentative',
  'payment_submitted',
  'secured',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show'
);
create type public.payment_status as enum ('submitted', 'confirmed', 'rejected');
create type public.payment_method as enum (
  'cash',
  'gcash',
  'bank_transfer',
  'card',
  'online_gateway',
  'booking_dot_com',
  'trip_dot_com',
  'other'
);

create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text,
  contact_email text,
  contact_phone text,
  default_currency text not null default 'PHP',
  default_downpayment_percent numeric(5,2) not null default 50 check (default_downpayment_percent >= 0 and default_downpayment_percent <= 100),
  house_rules text not null default 'Please present a valid ID at check-in. Check-in and check-out times follow the property policy. Payment proof is required for reservation security.',
  booking_terms text not null default 'Online bookings remain tentative until the down payment is confirmed by the hotel.',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'front_desk',
  hotel_id uuid references public.hotels(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  name text not null,
  description text,
  base_rate numeric(12,2) not null default 0 check (base_rate >= 0),
  capacity int not null default 2 check (capacity > 0),
  default_with_breakfast boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, name)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_type_id uuid references public.room_types(id) on delete set null,
  name text not null,
  room_type_name text,
  capacity int not null default 2 check (capacity > 0),
  base_rate numeric(12,2) not null default 0 check (base_rate >= 0),
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, name)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  guest_id uuid not null references public.guests(id) on delete restrict,
  status public.reservation_status not null default 'tentative',
  booking_source text not null default 'walk_in',
  check_in date not null,
  check_out date not null,
  nights int generated always as (greatest(check_out - check_in, 0)) stored,
  guest_count int not null default 1 check (guest_count > 0),
  with_breakfast boolean not null default false,
  posted_room_rate numeric(12,2) not null default 0 check (posted_room_rate >= 0),
  surcharge_label text,
  surcharge_amount numeric(12,2) not null default 0 check (surcharge_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  downpayment_required numeric(12,2) not null default 0 check (downpayment_required >= 0),
  mode_of_payment text,
  confirmed_by_name text,
  notes text,
  house_rules_sent_at timestamptz,
  confirmation_sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_reservation_dates check (check_out > check_in)
);

-- Blocks double-booking only for reservations that are actually secured or checked in.
-- Tentative reservations may overlap because they are not yet guaranteed.
alter table public.reservations
  add constraint prevent_secured_room_overlap
  exclude using gist (
    room_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('secured', 'checked_in'));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null default 'other',
  proof_path text not null,
  proof_original_name text,
  status public.payment_status not null default 'submitted',
  paid_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  entry_date date not null default current_date,
  category text not null default 'room',
  description text,
  amount numeric(12,2) not null default 0,
  payment_method public.payment_method not null default 'cash',
  is_collectible boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  count_date date not null default current_date,
  denomination numeric(12,2) not null check (denomination > 0),
  quantity int not null default 0 check (quantity >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (hotel_id, count_date, denomination)
);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  template text not null,
  to_email text not null,
  subject text not null,
  provider_id text,
  status text not null default 'queued',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid references public.hotels(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_rooms_hotel on public.rooms(hotel_id);
create index idx_reservations_hotel_dates on public.reservations(hotel_id, check_in, check_out);
create index idx_reservations_room_dates on public.reservations(room_id, check_in, check_out);
create index idx_reservations_status on public.reservations(status);
create index idx_payments_reservation on public.payments(reservation_id);
create index idx_payments_status on public.payments(status);
create index idx_email_logs_reservation_template on public.email_logs(reservation_id, template);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger hotels_set_updated_at before update on public.hotels for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger room_types_set_updated_at before update on public.room_types for each row execute function public.set_updated_at();
create trigger rooms_set_updated_at before update on public.rooms for each row execute function public.set_updated_at();
create trigger guests_set_updated_at before update on public.guests for each row execute function public.set_updated_at();
create trigger reservations_set_updated_at before update on public.reservations for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger ledger_entries_set_updated_at before update on public.ledger_entries for each row execute function public.set_updated_at();

create or replace function public.can_access_hotel(target_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'owner' or p.hotel_id = target_hotel_id)
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'owner'
  );
$$;

alter table public.hotels enable row level security;
alter table public.profiles enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;
alter table public.payments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.cash_counts enable row level security;
alter table public.email_logs enable row level security;
alter table public.audit_logs enable row level security;

create policy "staff can read accessible hotels" on public.hotels for select to authenticated using (public.can_access_hotel(id));
create policy "owners can manage hotels" on public.hotels for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "users can read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "users can update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "staff can read room types" on public.room_types for select to authenticated using (public.can_access_hotel(hotel_id));
create policy "owners can manage room types" on public.room_types for all to authenticated using (public.can_access_hotel(hotel_id)) with check (public.can_access_hotel(hotel_id));

create policy "staff can read rooms" on public.rooms for select to authenticated using (public.can_access_hotel(hotel_id));
create policy "staff can manage rooms" on public.rooms for all to authenticated using (public.can_access_hotel(hotel_id)) with check (public.can_access_hotel(hotel_id));

create policy "staff can read guests" on public.guests for select to authenticated using (true);
create policy "staff can manage guests" on public.guests for all to authenticated using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff can read reservations" on public.reservations for select to authenticated using (public.can_access_hotel(hotel_id));
create policy "staff can manage reservations" on public.reservations for all to authenticated using (public.can_access_hotel(hotel_id)) with check (public.can_access_hotel(hotel_id));

create policy "staff can read payments" on public.payments for select to authenticated using (
  exists (select 1 from public.reservations r where r.id = reservation_id and public.can_access_hotel(r.hotel_id))
);
create policy "staff can manage payments" on public.payments for all to authenticated using (
  exists (select 1 from public.reservations r where r.id = reservation_id and public.can_access_hotel(r.hotel_id))
) with check (
  exists (select 1 from public.reservations r where r.id = reservation_id and public.can_access_hotel(r.hotel_id))
);

create policy "staff can read ledger" on public.ledger_entries for select to authenticated using (public.can_access_hotel(hotel_id));
create policy "staff can manage ledger" on public.ledger_entries for all to authenticated using (public.can_access_hotel(hotel_id)) with check (public.can_access_hotel(hotel_id));

create policy "staff can read cash counts" on public.cash_counts for select to authenticated using (public.can_access_hotel(hotel_id));
create policy "staff can manage cash counts" on public.cash_counts for all to authenticated using (public.can_access_hotel(hotel_id)) with check (public.can_access_hotel(hotel_id));

create policy "staff can read email logs" on public.email_logs for select to authenticated using (true);
create policy "staff can read audit logs" on public.audit_logs for select to authenticated using (hotel_id is null or public.can_access_hotel(hotel_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "authenticated staff can read payment proofs" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs');

-- Initial hotels. Rename them inside the app if needed.
insert into public.hotels (name, slug, default_downpayment_percent, house_rules, booking_terms)
values
  (
    'Navarro Hotel',
    'navarro-hotel',
    50,
    'House rules: payment proof is mandatory; confirmed down payment secures the booking; present a valid ID at check-in; no unregistered guests without front desk approval.',
    'Bookings are tentative until down payment is confirmed by the hotel.'
  ),
  (
    'Tagosilangan',
    'tagosilangan',
    50,
    'House rules: payment proof is mandatory; confirmed down payment secures the booking; present a valid ID at check-in; observe resort quiet hours and posted property rules.',
    'Bookings are tentative until down payment is confirmed by the hotel.'
  )
on conflict (slug) do nothing;
