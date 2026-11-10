#!/usr/bin/env bash
# Apply the hand-written migrations to a disposable local database.
# The three 0002_*.sql files overlap. This applies the idempotent folio file,
# which is the one that creates outlets, remittances, and day tours.
# It does not apply 0002_pricing_charges_remittance_day_tours.sql or
# 0002_services_and_pricing.sql, because those CREATE TABLE statements conflict
# with the folio file. Do not point this script at a hosted database.
set -euo pipefail

DB_NAME="${1:-hotel_ops_test}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME};"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME};"
sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local-postgres/bootstrap.sql"
sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/0001_schema.sql"
sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/0002_services_pricing_folio_daytours.sql"
sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/0003_offline_and_printing.sql"

for file in "$ROOT"/supabase/migrations/2026*.sql; do
  [ -e "$file" ] || continue
  sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$file"
done

echo "Applied migrations to local database ${DB_NAME}"
