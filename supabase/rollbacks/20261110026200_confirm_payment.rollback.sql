drop function if exists public.confirm_submitted_payment(uuid, uuid, date, date);
alter table public.payments drop column if exists received_on;
