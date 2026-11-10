-- Undo PR1.3 columns. Inserted add-on rows are left in the catalog so existing
-- charges that point at them are not broken. Deactivate them in the app if needed.

-- remittance_outlet_id is not dropped. An older hand-applied file may already own it.
alter table public.service_items drop column if exists outlet_owed_unit;
alter table public.service_items drop column if exists outlet_owed_amount;
alter table public.service_items drop column if exists charge_unit;
alter table public.hotels drop column if exists breakfast_outlet_portion_per_head;
alter table public.hotels drop column if exists breakfast_rate_per_room;
