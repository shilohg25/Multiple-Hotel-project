# Impact of the operational write guards

Checked against `origin/main` (production code). The new migration is `supabase/migrations/20261110015100_operational_write_guards.sql`.

## Does production write these tables from the browser?

No. On `origin/main` the browser Supabase client is created in `lib/supabase-client.ts` and used only by:

- `components/LoginForm.tsx` (sign in)
- `components/SignOutButton.tsx` (sign out)

There is no `.from('reservations')`, `.from('payments')`, `.from('ledger_entries')`, `.from('cash_counts')`, or `.from('guests')` call in a client component on `origin/main`.

Every write found is in server code that imports `supabaseAdmin` (`lib/supabase-admin.ts`). That client is built with `SUPABASE_SERVICE_ROLE_KEY`. The service role bypasses row level security. Confirmed call sites:

- `app/api/reservations/route.ts` and `app/api/reservations/[id]/route.ts` (insert and update reservations, update guests)
- `app/api/reservations/[id]/move/route.ts` and `email-status/route.ts`
- `app/api/payments/route.ts` and `app/api/payments/[id]/confirm/route.ts` (insert and update payments, insert ledger rows, update reservations)
- `app/api/ledger/route.ts`
- `app/api/cash-counts/route.ts`
- `app/api/public/bookings/route.ts` (insert guest, reservation, and payment)
- `lib/email.ts` (reservation timestamp updates)

Reads in server pages (`dashboard`, `sales`, `payments`, print reports, `lib/report-data.ts`) also use `supabaseAdmin`, so the new guest policy does not hide rows from those pages.

## What the new guards change

Direct PostgREST calls with a signed-in staff JWT are what the permissive `0001_schema.sql` policies still allow. Those calls are now stopped or audited:

- Front desk, cashier, and restaurant staff can change a reservation only to check a guest in or out. Dates, room, guest count, breakfast, surcharge, and money fields stay as they are. Managers and owners can still change those fields.
- They cannot delete reservations, payments, ledger rows, or cash counts.
- They cannot update someone else's ledger row or cash count.
- A direct ledger insert must set `created_by` to the signed-in staff member, must be for a hotel they can access, and must be a positive amount. An expense is a positive expense. A sale, deposit, or collectible is a positive amount. A negative row is rejected.
- Guests are visible only to the owner, or to staff who can access a hotel that has a reservation for that guest.
- Each allowed direct write inserts an `audit_logs` row.

`20261110015200_operational_write_guard_tightening.sql` replaces the guard function. It does not edit `20261110015100`.

## Payment confirm and reject

The payment row is not day-locked. Confirming or rejecting a submitted payment is never refused because the stay's check-in date, or the day the proof was submitted, is locked. A generated `nights` value is ignored in the staff reservation check, because it is null in `NEW` during a BEFORE trigger.

The ledger row written when the money is received is still day-locked, on the business date of that receipt. Public `/book` inserts a guest, a reservation, and a submitted payment. None of those inserts are day-locked, so a new public booking does not fail because a day is locked.

The service role has no `auth.uid()`, so the trigger skips the role checks and the ledger insert checks. Production API routes keep working. Once `day_closes` exists, the same trigger still refuses ledger, cash-count, and charge writes on a locked business date, including writes from the service role. Production has no locked days until a manager locks one, so current live traffic is not blocked.

## What was left alone

Public `/book` still lists TEST hotels. Hiding them is an owner decision and is not part of this change.
