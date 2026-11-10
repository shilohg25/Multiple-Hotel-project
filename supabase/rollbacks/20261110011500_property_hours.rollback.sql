-- Undo PR1.5. Clock times already stored on the hotel are left as they are.

drop table if exists public.stay_time_requests;
alter table public.hotels drop column if exists late_checkout_hourly_rate;
alter table public.hotels drop column if exists early_checkin_hourly_rate;
