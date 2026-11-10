-- Read-only. This file does not insert, update, or delete.
-- Run it before applying supabase/migrations/20261110026100_ledger_outlet_and_shortage_status.sql.
-- Any row returned means that migration's unique index will fail until only one
-- shortage charge remains for that day close.

select day_close_id, count(*) as shortage_rows
from public.shortage_charges
where day_close_id is not null
group by day_close_id
having count(*) > 1
order by shortage_rows desc, day_close_id;
