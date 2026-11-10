drop table if exists public.shortage_charges;
drop table if exists public.day_close_counts;
drop table if exists public.day_closes;
alter table public.hotels drop column if exists rvf_float_amount;
