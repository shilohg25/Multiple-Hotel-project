-- PR1.1 property and outlet setup.
-- Additive. Does not rename the existing "* Restaurant" outlets.
-- Requires public.outlets from the hand-applied folio migration
-- (0002_services_pricing_folio_daytours.sql, or the equivalent tables).

alter table public.hotels
  add column if not exists legal_name text;

alter table public.hotels
  add column if not exists is_reporting_unit boolean not null default true;

alter table public.outlets
  add column if not exists legal_name text;

alter table public.outlets
  add column if not exists is_reporting_unit boolean not null default false;

comment on column public.hotels.legal_name is
  'Legal entity name. Navarro assumption: NAVSOT Corp. Tagosilangan is left blank until Shiloh sets it.';

comment on column public.outlets.is_reporting_unit is
  'True for outlets that get their own monthly P&L, such as Sotera Café and Tago Resto.';

update public.hotels
set legal_name = 'NAVSOT Corp'
where slug = 'navarro-hotel'
  and legal_name is null;

insert into public.outlets (hotel_id, name, slug, outlet_type, active, legal_name, is_reporting_unit)
select h.id, 'Sotera Café', 'sotera-cafe', 'restaurant', true, 'NAVSOT Corp', true
from public.hotels h
where h.slug = 'navarro-hotel'
on conflict (hotel_id, slug) do update
set
  is_reporting_unit = true,
  legal_name = coalesce(public.outlets.legal_name, excluded.legal_name);

insert into public.outlets (hotel_id, name, slug, outlet_type, active, legal_name, is_reporting_unit)
select h.id, 'Tago Resto', 'tago-resto', 'restaurant', true, null, true
from public.hotels h
where h.slug = 'tagosilangan'
on conflict (hotel_id, slug) do update
set is_reporting_unit = true;
