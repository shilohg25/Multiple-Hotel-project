drop index if exists public.shortage_charges_one_per_close;
alter table public.shortage_charges drop constraint if exists shortage_charges_status_check;
alter table public.shortage_charges drop column if exists status;
drop index if exists public.idx_ledger_entries_outlet_date;
alter table public.ledger_entries drop column if exists outlet_id;
