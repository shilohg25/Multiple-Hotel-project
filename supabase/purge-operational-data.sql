-- Owner/admin maintenance helper.
-- This purges operational records while keeping auth users, profiles, hotels,
-- rooms, room prices, service catalog, and settings.
--
-- Run manually in Supabase SQL Editor only after taking a backup.
-- This does not delete payment proof files from Supabase Storage.
-- Remove proof files separately from the Storage UI or Storage API if needed.

begin;

truncate table public.remittance_items restart identity cascade;
truncate table public.remittances restart identity cascade;
truncate table public.day_tour_payments restart identity cascade;
truncate table public.day_tour_bookings restart identity cascade;
truncate table public.reservation_charges restart identity cascade;
truncate table public.payments restart identity cascade;
truncate table public.email_logs restart identity cascade;
truncate table public.audit_logs restart identity cascade;
truncate table public.ledger_entries restart identity cascade;
truncate table public.cash_counts restart identity cascade;
truncate table public.reservations restart identity cascade;
truncate table public.guests restart identity cascade;

commit;
