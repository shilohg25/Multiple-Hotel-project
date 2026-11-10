-- Undo PR0.2. Run only to roll back that migration. Do not run this as part of apply.
-- Forward migrations stay additive. This file is the only place that removes hotels.timezone.

alter table public.hotels drop column if exists timezone;
