-- PR0.2 business timezone.
-- Additive and idempotent. Apply after 0001_schema.sql (and whichever 0002 was
-- applied by hand). Does not depend on the conflicting 0002_*.sql files.
-- hotels.timezone is the IANA zone used for "today", report day bounds, and
-- ledger entry dates. Asia/Manila is the assumption until Shiloh sets another zone.

alter table public.hotels
  add column if not exists timezone text not null default 'Asia/Manila';

comment on column public.hotels.timezone is
  'IANA timezone for business-day boundaries. Default Asia/Manila (Boracay/Malay).';
