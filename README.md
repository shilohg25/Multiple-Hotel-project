# Hotel Booking App

A ready-to-use Next.js + Supabase web app for hotel reservations, payment proof tracking, online booking requests, staff login, multi-hotel management, and a Gantt-style booking board.

## Recommended stack

This version uses **Next.js App Router + Supabase**.

Why this stack fits the requirement:

- Next.js supports a single web app with public booking pages, protected staff pages, server routes, and React client components.
- Supabase provides Postgres database, Auth, Storage for payment proofs, and APIs.
- The app can run in GitHub Codespaces or any Node hosting environment.
- The Gantt booking board is custom-built, so it avoids a paid scheduler dependency.

Other possible stacks:

| Option | Good for | Tradeoff |
|---|---|---|
| Next.js + Supabase | Best balance for this project | Requires Node/React setup |
| React/Vite + Supabase | Simpler frontend | Needs separate server for secure email/admin actions |
| Laravel/Filament + Postgres | Strong admin/back-office workflows | Heavier setup; less natural for public React booking UX |
| Django + Postgres | Strong internal system | More backend-heavy; less friendly for drag calendar UI |

## Features included

- Staff login using Supabase Auth.
- Owner can add hotels.
- Multiple hotels supported from the database design.
- Add and manage rooms per hotel.
- Staff reservation creation.
- Public online booking page per hotel: `/book/navarro-hotel`, `/book/tagosilangan`, etc.
- Payment proof upload to Supabase Storage.
- Payment proof is mandatory for online booking and staff payment recording.
- Status workflow:
  - `tentative`: reservation exists but no confirmed down payment.
  - `payment_submitted`: proof uploaded and waiting for staff review.
  - `secured`: down payment confirmed.
  - `checked_in`, `checked_out`, `cancelled`, `no_show` are available for operations.
- Gantt-style room board with drag-to-move booking blocks.
- Secured reservation overlap blocking at database level.
- House rules email after guest email is captured.
- Booking confirmation email after down payment is confirmed.
- Audit log table for important actions.
- Optional schema tables for daily sales and cash count workflows from the Excel calculation sample.

## Project structure

```text
app/
  (protected)/dashboard       Staff dashboard
  (protected)/reservations    Gantt booking board
  (protected)/payments        Payment list
  (protected)/rooms           Room management
  (protected)/hotels          Hotel management
  book/[hotelSlug]            Public online booking page
  api/                        Server routes
components/                   Reusable UI and forms
lib/                          Supabase, auth, email, date, money helpers
supabase/migrations/          Database schema
supabase/seed.sql             Optional sample room inventory
```

## Setup in Supabase

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase/migrations/0001_schema.sql`.
4. Optional: run `supabase/seed.sql` to create sample rooms based on the Excel files.
5. In Supabase Auth, create your first staff user.
6. Copy that user's UUID.
7. Edit and run `supabase/create-owner-profile.sql` to make that user the owner.
8. Confirm that Storage has a private bucket named `payment-proofs`.

## Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY=YOUR_RESEND_API_KEY
EMAIL_FROM="Reservations <reservations@yourdomain.com>"
APP_BASE_URL=http://localhost:3000
```

Email sending is safe to test without `RESEND_API_KEY`; emails are logged as skipped. To actually send emails, add a valid Resend API key or adapt `lib/email.ts` to your preferred email provider.

## Run locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Public booking pages:

```text
http://localhost:3000/book/navarro-hotel
http://localhost:3000/book/tagosilangan
```

## GitHub / Codespaces testing

The project includes `.devcontainer/devcontainer.json`.

1. Push this folder to your GitHub repository.
2. Open it in GitHub Codespaces.
3. Add the environment variables in Codespaces secrets or create `.env.local` inside the Codespace.
4. Run `npm run dev`.
5. The forwarded port `3000` opens the app preview.

## Payment workflow

1. A public guest submits a booking and uploads proof.
2. The reservation status becomes `payment_submitted`.
3. Staff opens the reservation detail page.
4. Owner, manager, or accounting confirms the payment.
5. If confirmed payments meet or exceed the required down payment, status becomes `secured`.
6. Booking confirmation email is sent automatically if guest email exists.

## House rules email workflow

- Public booking: sent immediately after booking creation because email is required.
- Staff-created booking: sent when email is included in the reservation record.
- Email log is stored in `email_logs`.

## Gantt booking board

The reservation board is available at `/reservations`. It supports:

- Hotel switching.
- Previous/next date range navigation.
- Room rows.
- Date columns.
- Dragging booking blocks horizontally to change dates.
- Dragging booking blocks vertically to move rooms.
- Database conflict prevention for secured bookings.

## Important business settings to update

After first run, update each hotel's settings:

- Correct hotel name.
- Address and contact details.
- Default down payment percent.
- House rules.
- Booking terms.
- Room list and rates.

## Questions still needed for final production configuration

1. What are the official hotel names, addresses, phone numbers, and booking email addresses?
2. What exact down payment rule should be used: fixed percent, fixed amount, or first-night amount?
3. Which payment channels do you accept: GCash, bank transfer, card, payment gateway, Booking.com, Trip.com, cash?
4. Should online bookings be allowed to overlap tentative bookings or should all tentative bookings also block availability?
5. What are the exact house rules and check-in/check-out times for each hotel?
6. Which staff roles do you want: owner, manager, front desk, accounting only, or more?
7. Should guests receive SMS/WhatsApp notifications in addition to email?
8. Should the daily sales/cash-count screen be built next from the `ledger_entries` and `cash_counts` tables?
