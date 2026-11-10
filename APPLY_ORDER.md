# Migration apply order

Preview uses the shared DB: enter TEST- data only.

Nothing in this repo should be applied to the hosted Supabase project by the coding agent. Shiloh applies these files after a backup. Every new migration is additive (no `DROP`, rename, or type narrowing). Each one has a matching file in `supabase/rollbacks/`. Rollbacks are the only undo path.

Do not run `supabase/purge-operational-data.sql`.

## Already in the repo (applied by hand on the hosted database)

These three `0002_*.sql` files overlap. The live database has no `supabase_migrations` history, so do not assume all three were applied, and do not re-apply a `0002` that creates tables without `IF NOT EXISTS`.

1. `supabase/migrations/0001_schema.sql`
2. One overlapping pricing/folio migration. Local tests apply only `supabase/migrations/0002_services_pricing_folio_daytours.sql` because it is idempotent and includes outlets, remittances, and day tours. Do not also apply `0002_pricing_charges_remittance_day_tours.sql` or `0002_services_and_pricing.sql` on that same database.
3. `supabase/migrations/0003_offline_and_printing.sql`

## New migrations (apply in this order, after the files above)

| Order | Apply | Rollback |
|---|---|---|
| 1 | `supabase/migrations/20261110000200_hotel_timezone.sql` | `supabase/rollbacks/20261110000200_hotel_timezone.rollback.sql` |
| 2 | `supabase/migrations/20261110011100_reporting_units.sql` | `supabase/rollbacks/20261110011100_reporting_units.rollback.sql` |
| 3 | `supabase/migrations/20261110011200_room_channel_rates.sql` | `supabase/rollbacks/20261110011200_room_channel_rates.rollback.sql` |
| 3b | `supabase/migrations/20261110011210_rate_override_review.sql` | `supabase/rollbacks/20261110011210_rate_override_review.rollback.sql` |
| 4 | `supabase/migrations/20261110011300_priced_addons.sql` | `supabase/rollbacks/20261110011300_priced_addons.rollback.sql` |
| 5 | `supabase/migrations/20261110011500_property_hours.sql` | `supabase/rollbacks/20261110011500_property_hours.rollback.sql` |
| 5b | `supabase/migrations/20261110011510_stay_time_review.sql` | `supabase/rollbacks/20261110011510_stay_time_review.rollback.sql` |
| 6 | `supabase/migrations/20261110011400_payment_channels.sql` | `supabase/rollbacks/20261110011400_payment_channels.rollback.sql` |
| 7 | `supabase/migrations/20261110015000_staff_roles.sql` | `supabase/rollbacks/20261110015000_staff_roles.rollback.sql` |
| 8 | `supabase/migrations/20261110015100_operational_write_guards.sql` | `supabase/rollbacks/20261110015100_operational_write_guards.rollback.sql` |

`20261110000200_hotel_timezone.sql` only adds `hotels.timezone` (default `Asia/Manila`). It does not depend on which `0002` file was used.

`20261110011100_reporting_units.sql` adds legal names and a reporting-unit flag. It inserts Sotera Café and Tago Resto. It does not rename older restaurant outlets. It needs the `outlets` table from the folio `0002`.

## Test data

After the migrations:

1. `supabase/seed/test-data.sql` — fake rows only. Every name is prefixed `TEST-`. Staff profiles attach to auth users by email placeholder. No passwords are stored in the repo.
2. `supabase/seed/cleanup-test-data.sql` — deletes only `TEST-` rows.

On a disposable local Postgres, `scripts/local-postgres/bootstrap.sql` creates the Supabase role and storage stubs, then `scripts/local-postgres/apply.sh` loads `0001`, the folio `0002`, `0003`, and every `supabase/migrations/2026*.sql` file in name order.
