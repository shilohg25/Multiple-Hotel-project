-- PR1.3 priced add-ons.
-- Prices are settings. This only fills a price that is still zero, so a later edit is kept.
-- Breakfast is 500 per room per day. The outlet is owed 250 per head.

alter table public.hotels
  add column if not exists breakfast_rate_per_room numeric(12,2) not null default 500;

alter table public.hotels
  add column if not exists breakfast_outlet_portion_per_head numeric(12,2) not null default 250;

alter table public.service_items
  add column if not exists charge_unit text not null default 'each';

alter table public.service_items
  add column if not exists outlet_owed_amount numeric(12,2) not null default 0;

alter table public.service_items
  add column if not exists outlet_owed_unit text not null default 'none';

alter table public.service_items
  add column if not exists remittance_outlet_id uuid references public.outlets(id) on delete set null;

insert into public.service_items (hotel_id, name, category, default_price, active, remittance_required, charge_unit, outlet_owed_amount, outlet_owed_unit)
select h.id, v.name, v.category, v.price, true, v.remit, v.unit, v.owed, v.owed_unit
from public.hotels h
join (
  values
    ('Breakfast', 'breakfast', 500::numeric, true, 'per_room_per_day', 250::numeric, 'per_head'),
    ('Extra breakfast', 'breakfast', 250::numeric, true, 'per_head', 250::numeric, 'per_head'),
    ('Extra bed with breakfast', 'extra_bed', 850::numeric, true, 'each', 250::numeric, 'per_head'),
    ('Extra bed without breakfast', 'extra_bed', 600::numeric, false, 'each', 0::numeric, 'none'),
    ('Early check-in', 'early_checkin', 200::numeric, false, 'per_hour', 0::numeric, 'none'),
    ('Late checkout', 'late_checkout', 200::numeric, false, 'per_hour', 0::numeric, 'none'),
    ('Laundry', 'laundry', 0::numeric, false, 'each', 0::numeric, 'none'),
    ('Minibar / snacks', 'other', 0::numeric, false, 'each', 0::numeric, 'none')
) as v(name, category, price, remit, unit, owed, owed_unit) on true
where not exists (
  select 1 from public.service_items s
  where s.hotel_id = h.id and lower(s.name) = lower(v.name)
);

update public.service_items
set
  default_price = case lower(name)
    when 'breakfast' then 500
    when 'early check-in' then 200
    when 'late checkout' then 200
    else default_price
  end,
  charge_unit = case lower(name)
    when 'breakfast' then 'per_room_per_day'
    when 'early check-in' then 'per_hour'
    when 'late checkout' then 'per_hour'
    else charge_unit
  end,
  outlet_owed_amount = case when lower(name) = 'breakfast' then 250 else outlet_owed_amount end,
  outlet_owed_unit = case when lower(name) = 'breakfast' then 'per_head' else outlet_owed_unit end,
  remittance_required = case when lower(name) = 'breakfast' then true else remittance_required end
where default_price = 0
  and lower(name) in ('breakfast', 'early check-in', 'late checkout');

update public.service_items s
set remittance_outlet_id = o.id
from public.outlets o
where s.remittance_outlet_id is null
  and s.outlet_owed_amount > 0
  and o.hotel_id = s.hotel_id
  and o.slug in ('sotera-cafe', 'tago-resto')
  and o.is_reporting_unit is true;
