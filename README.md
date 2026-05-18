# Multiple Hotel Operations App

Dynamic Next.js + Supabase + Vercel app for running multiple hotel properties. It supports staff login, hotels, rooms, reservations, payment proof review, booking board, folio charges, manual email drafts, daily sales/cash count, remittance foundation, and basic day tours.

## Important Hosting Note

Do not use GitHub Pages for this app. It is not a static site and must stay dynamic.

Do not add static-export, repository subpath, or GitHub Pages asset settings.

Deploy on Vercel as a normal Next.js project.

## Development Workflow

1. Open this folder in VS Code.
2. Make changes with Codex.
3. Run:

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

4. Commit and push with GitHub Desktop.
5. Vercel auto-deploys from GitHub.

Never commit `.env.local`.

## Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables for Production, Preview, and Development:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_BASE_URL=https://your-vercel-app.vercel.app
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It must never be exposed in client components.

After changing environment variables, redeploy.

## Supabase Setup

Run migrations in order from `supabase/migrations`:

1. `0001_schema.sql`
2. `0002_pricing_charges_remittance_day_tours.sql` if you are using the older foundation migration
3. `0002_services_and_pricing.sql` if already part of your existing setup
4. `0002_services_pricing_folio_daytours.sql`
5. `0003_offline_and_printing.sql`

The newest migration is additive and safe for the current workflow. It creates or ensures:

- service catalog
- reservation folio charges
- price change logs
- outlets
- remittances
- day tour packages/bookings/payments
- helper reporting views
- offline sync request tracking

Create the first owner:

1. Create the owner user in Supabase Authentication.
2. Run `supabase/create-owner-profile.sql` after replacing the email/UUID placeholders.
3. Owner profiles can have `hotel_id = null`.

If a user can log in but sees `/profile-missing`, their Auth user exists but `public.profiles` has no row for them.

## Storage

The app uses the `payment-proofs` Supabase Storage bucket for reservation and day tour proof uploads.

Allowed file types:

- image/jpeg
- image/png
- image/webp
- application/pdf

Payment proof is mandatory before payment review. Staff must confirm payment before a reservation becomes secured.

## Business Rules

- Tentative bookings do not block room dates.
- Payment-submitted bookings do not block room dates.
- Only secured and checked-in reservations block room dates.
- Existing reservations keep their saved `posted_room_rate`.
- Changing room prices affects new reservations only.
- Changing service default prices affects new folio charges only.
- Existing reservation charges keep their saved `unit_price` and `total_amount`.
- Email tools create manual drafts only. There is no email API.
- There is no payment gateway.
- Day tours do not block room inventory.

## Printing

The app uses browser print so staff can print on paper or save as PDF from the browser. It does not generate official tax receipts yet.

Available print pages:

- Guest Folio / Checkout Statement
- Booking Confirmation
- Check-in Form
- Payment Acknowledgement
- Daily Report
- Monthly Report
- Remittance Report
- Pending Payment Proof Report
- Tentative Follow-up Report

Use these labels for customer documents: Guest Folio, Checkout Statement, Payment Acknowledgement, and Booking Confirmation. Official tax receipt handling can be added later if required by local rules.

## Offline MVP

Offline support is staff-side only and intentionally lean.

What works offline:

- Save staff reservation drafts locally.
- Save reservation charge drafts locally.
- Save payment proof drafts locally if the file can be stored in the browser.
- Save daily cash count drafts locally.
- Save print snapshots from reservation and report pages.
- Print saved snapshots from `/offline`.

What does not work offline:

- Confirm payments.
- Secure bookings.
- Guarantee room/date availability.
- Receive new public customer bookings into a staff browser.
- Sync if browser storage is cleared.

How sync works:

- Go to `/offline` or use the Offline Queue banner.
- Click Sync Now when the device is online.
- The server remains the source of truth.
- Offline reservation drafts sync as tentative only.
- Payment proof drafts sync as submitted only and still need online confirmation.
- Server conflict checks run before accepting synced reservations.
- Conflicts or risky duplicates become Needs Review instead of syncing silently.

## Test Checklist

Use this order after local startup or Vercel deployment:

- `/api/health`
- `/login`
- `/dashboard`
- `/hotels`
- `/rooms`
- `/settings`
- `/settings/pricing`
- `/settings/services`
- `/settings/price-history`
- `/settings/staff`
- `/reservations/new`
- reservation detail folio
- reservation print links
- `/reports/daily`
- `/reports/monthly`
- `/offline`
- `/payments`
- `/board`
- `/sales`
- `/remittances`
- `/day-tours`
- `/day-tours/packages`
- `/book/navarro-hotel`

## Troubleshooting

`/api/health` returns setup status without exposing secret values.

HTTP 405 after logout usually means logout used a GET or preserved POST on redirect. This app uses `POST /api/auth/signout` with HTTP 303.

Too many redirects after login usually means the Auth user has no `public.profiles` row. Go to `/profile-missing` and create the profile.

`/env-error` means required environment variables are missing or invalid in Vercel/local env.

Payment upload failures usually mean the `payment-proofs` bucket is missing or Storage MIME/size rules are blocking the file.

## Maintenance

`supabase/purge-operational-data.sql` can purge operational records while keeping users, profiles, hotels, rooms, prices, and service catalog. It does not delete payment proof files from Supabase Storage.
