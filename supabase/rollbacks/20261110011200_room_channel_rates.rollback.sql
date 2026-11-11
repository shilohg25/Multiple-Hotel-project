-- Undo PR1.2 tables. Seeded room types are left in place so existing rooms
-- do not lose their type link. Clear those in the app if you need to.

drop table if exists public.rate_override_requests;
drop table if exists public.room_type_channel_rates;
