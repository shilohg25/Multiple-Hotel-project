-- Outlet on each ledger line, and a voidable shortage charge.
-- Additive. Does not delete shortage rows.

alter table public.ledger_entries
  add column if not exists outlet_id uuid references public.outlets(id) on delete set null;

create index if not exists idx_ledger_entries_outlet_date on public.ledger_entries(hotel_id, entry_date, outlet_id);

alter table public.shortage_charges
  add column if not exists status text not null default 'open';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shortage_charges_status_check'
      and conrelid = 'public.shortage_charges'::regclass
  ) then
    alter table public.shortage_charges
      add constraint shortage_charges_status_check check (status in ('open', 'void'));
  end if;
end $$;

create unique index if not exists shortage_charges_one_per_close
  on public.shortage_charges (day_close_id);
