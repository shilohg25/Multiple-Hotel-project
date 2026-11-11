-- PR2.6 close the day. Additive. The revolving fund defaults to 10000.

alter table public.hotels
  add column if not exists rvf_float_amount numeric(12,2) not null default 10000;

create table if not exists public.day_closes (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete set null,
  business_date date not null,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  rvf_float numeric(12,2) not null default 10000,
  float_counted numeric(12,2) not null default 0,
  drawer_counted numeric(12,2) not null default 0,
  bank_deposit numeric(12,2) not null default 0,
  return_to_fund numeric(12,2) not null default 0,
  variance_amount numeric(12,2) not null default 0,
  variance_status text not null default 'balanced' check (variance_status in ('balanced', 'short', 'excess')),
  variance_note text,
  status text not null default 'draft' check (status in ('draft', 'locked')),
  prepared_by uuid references public.profiles(id) on delete set null,
  locked_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  unlocked_by uuid references public.profiles(id) on delete set null,
  unlocked_at timestamptz,
  unlock_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists day_closes_unit_date
  on public.day_closes (hotel_id, business_date, (coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid)));

create table if not exists public.day_close_counts (
  id uuid primary key default gen_random_uuid(),
  day_close_id uuid not null references public.day_closes(id) on delete cascade,
  bucket text not null check (bucket in ('float', 'drawer')),
  denomination numeric(12,2) not null check (denomination > 0),
  quantity int not null default 0 check (quantity >= 0),
  unique (day_close_id, bucket, denomination)
);

create table if not exists public.shortage_charges (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  outlet_id uuid references public.outlets(id) on delete set null,
  business_date date not null,
  day_close_id uuid references public.day_closes(id) on delete cascade,
  staff_profile_id uuid references public.profiles(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.day_closes enable row level security;
alter table public.day_close_counts enable row level security;
alter table public.shortage_charges enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'day_closes' and policyname = 'staff read day closes') then
    execute 'create policy "staff read day closes" on public.day_closes for select to authenticated using (public.can_access_hotel(hotel_id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shortage_charges' and policyname = 'staff read shortages') then
    execute 'create policy "staff read shortages" on public.shortage_charges for select to authenticated using (public.can_access_hotel(hotel_id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shortage_charges' and policyname = 'only managers see shortages') then
    execute 'create policy "only managers see shortages" on public.shortage_charges as restrictive for select to authenticated using (public.current_app_role() in (''owner'', ''manager''))';
  end if;
end $$;
