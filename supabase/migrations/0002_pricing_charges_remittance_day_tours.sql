create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  name text not null,
  slug text not null,
  outlet_type text not null check (outlet_type in ('hotel','restaurant','other')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hotel_id, slug)
);

create table public.service_items (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete set null,
  name text not null,
  category text not null,
  default_price numeric(12,2) not null default 0 check (default_price >= 0),
  remittance_required boolean not null default false,
  remittance_outlet_id uuid references public.outlets(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reservation_charges (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  service_item_id uuid references public.service_items(id) on delete set null,
  description text not null,
  category text not null,
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  total_amount numeric(12,2) generated always as (round((quantity * unit_price)::numeric, 2)) stored,
  revenue_outlet_id uuid references public.outlets(id) on delete set null,
  remittance_required boolean not null default false,
  remittance_outlet_id uuid references public.outlets(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.remittances (
  id uuid primary key default gen_random_uuid(),
  from_hotel_id uuid not null references public.hotels(id) on delete cascade,
  to_outlet_id uuid not null references public.outlets(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  amount_due numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','partial','remitted','cancelled')),
  paid_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remittance_period_check check (period_end >= period_start)
);

create table public.remittance_items (
  id uuid primary key default gen_random_uuid(),
  remittance_id uuid not null references public.remittances(id) on delete cascade,
  reservation_charge_id uuid references public.reservation_charges(id) on delete set null,
  day_tour_booking_id uuid,
  description text,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.rate_plans (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(hotel_id, name)
);

create table public.room_rate_overrides (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  room_type_id uuid references public.room_types(id) on delete cascade,
  rate_plan_id uuid references public.rate_plans(id) on delete set null,
  start_date date not null,
  end_date date not null,
  rate numeric(12,2) not null check (rate >= 0),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_rate_override_dates check (end_date >= start_date)
);

create table public.day_tour_packages (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.day_tour_bookings (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  package_id uuid not null references public.day_tour_packages(id) on delete restrict,
  guest_name text not null,
  guest_email text,
  guest_phone text,
  tour_date date not null,
  adult_count int not null default 0,
  child_count int not null default 0,
  total_amount numeric(12,2) not null default 0,
  downpayment_required numeric(12,2) not null default 0,
  status text not null default 'tentative' check (status in ('tentative','payment_submitted','secured','completed','cancelled','no_show')),
  payment_details text,
  proof_path text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.remittance_items
  add constraint remittance_items_day_tour_booking_fk
  foreign key (day_tour_booking_id) references public.day_tour_bookings(id) on delete set null;

create trigger outlets_set_updated_at before update on public.outlets for each row execute function public.set_updated_at();
create trigger service_items_set_updated_at before update on public.service_items for each row execute function public.set_updated_at();
create trigger reservation_charges_set_updated_at before update on public.reservation_charges for each row execute function public.set_updated_at();
create trigger remittances_set_updated_at before update on public.remittances for each row execute function public.set_updated_at();
create trigger rate_plans_set_updated_at before update on public.rate_plans for each row execute function public.set_updated_at();
create trigger room_rate_overrides_set_updated_at before update on public.room_rate_overrides for each row execute function public.set_updated_at();
create trigger day_tour_packages_set_updated_at before update on public.day_tour_packages for each row execute function public.set_updated_at();
create trigger day_tour_bookings_set_updated_at before update on public.day_tour_bookings for each row execute function public.set_updated_at();
