-- Undo PR1.1. Not part of the forward apply.

delete from public.outlets
where slug in ('sotera-cafe', 'tago-resto');

alter table public.outlets drop column if exists is_reporting_unit;
alter table public.outlets drop column if exists legal_name;
alter table public.hotels drop column if exists is_reporting_unit;
alter table public.hotels drop column if exists legal_name;
