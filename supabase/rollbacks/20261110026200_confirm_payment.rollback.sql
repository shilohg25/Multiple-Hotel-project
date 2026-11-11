drop function if exists public.reject_submitted_payment(uuid, uuid, text);
drop function if exists public.confirm_submitted_payment(uuid, uuid, date, date);
-- Dropping the functions removes the service_role execute grants.
alter table public.payments drop column if exists received_on;
