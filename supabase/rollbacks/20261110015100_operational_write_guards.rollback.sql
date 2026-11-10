-- Undo the direct-write guards. Does not restore or drop the original 0001 policies.

drop trigger if exists guard_reservations_write on public.reservations;
drop trigger if exists guard_payments_write on public.payments;
drop trigger if exists guard_ledger_entries_write on public.ledger_entries;
drop trigger if exists guard_cash_counts_write on public.cash_counts;
drop trigger if exists guard_reservation_charges_write on public.reservation_charges;

drop policy if exists "frontline cannot delete reservations" on public.reservations;
drop policy if exists "frontline cannot delete payments" on public.payments;
drop policy if exists "frontline cannot delete ledger" on public.ledger_entries;
drop policy if exists "frontline cannot delete cash counts" on public.cash_counts;
drop policy if exists "guests only for their hotel" on public.guests;

drop function if exists public.guard_direct_staff_write();
drop function if exists public.assert_business_day_open(uuid, date, uuid);
