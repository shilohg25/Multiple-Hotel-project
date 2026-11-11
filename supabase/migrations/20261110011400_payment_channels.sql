-- PR1.4 payment channels. Card surcharge and MDR are rows, not hard-coded.
-- New enum labels are added and never removed.

alter type public.payment_method add value if not exists 'maya';
alter type public.payment_method add value if not exists 'cheque';
-- Re-running does not overwrite a percent a manager has changed.

create table if not exists public.payment_channels (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null,
  surcharge_percent numeric(6,3) not null default 0,
  mdr_percent numeric(6,3) not null default 0,
  requires_proof boolean not null default false,
  counts_as_cash boolean not null default false,
  is_collectible boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, code)
);

create index if not exists idx_payment_channels_hotel on public.payment_channels(hotel_id, sort_order);
alter table public.payment_channels enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'payment_channels' and policyname = 'staff can read payment channels'
  ) then
    execute 'create policy "staff can read payment channels" on public.payment_channels for select to authenticated using (public.can_access_hotel(hotel_id))';
  end if;
end $$;

insert into public.payment_channels (
  hotel_id, code, name, kind, surcharge_percent, mdr_percent, requires_proof, counts_as_cash, is_collectible, sort_order
)
select h.id, v.code, v.name, v.kind, v.surcharge, v.mdr, v.proof, v.cash, v.collectible, v.sort_order
from public.hotels h
join (
  values
    ('cash', 'Cash', 'cash', 0::numeric, 0::numeric, false, true, false, 10),
    ('gcash', 'GCash', 'ewallet', 0, 0, true, false, false, 20),
    ('maya', 'Maya', 'ewallet', 0, 0, true, false, false, 30),
    ('bank_transfer', 'Bank transfer', 'bank', 0, 0, true, false, false, 40),
    ('card_metrobank', 'Card (Metrobank swiper)', 'card', 3, 3.5, false, false, false, 50),
    ('cheque', 'Cheque', 'cheque', 0, 0, false, false, false, 60),
    ('ota_booking', 'OTA payout · Booking.com', 'ota', 0, 0, false, false, true, 70),
    ('ota_trip', 'OTA payout · Trip.com', 'ota', 0, 0, false, false, true, 80),
    ('ota_expedia', 'OTA payout · Expedia', 'ota', 0, 0, false, false, true, 90),
    ('company_billing', 'Company billing', 'company', 0, 0, false, false, true, 100)
) as v(code, name, kind, surcharge, mdr, proof, cash, collectible, sort_order) on true
on conflict (hotel_id, code) do nothing;
