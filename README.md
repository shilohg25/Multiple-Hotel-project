# Multiple Hotel Booking App

Ready-to-use Next.js + Supabase web app for a hotel business with staff login, public booking requests, payment proof review, multi-hotel management, a drag booking board, and daily sales/cash-count tracking.

## Stack

- **Next.js App Router** for protected staff pages, public booking pages, server routes, and interactive React components.
- **Supabase** for Postgres, Auth, Storage, and database APIs.
- **Custom Gantt-style reservation board** to avoid paid scheduler dependencies.
- **GitHub Codespaces / GitHub Launcher friendly** Node setup.

## Business rules implemented

- The app supports **2 hotels now and more hotels later**.
- Owner can add hotels from the app.
- Hotel contact information is available but **not mandatory yet**:
  - address
  - phone
  - contact email
  - booking email
  - website
  - description
  - check-in/check-out times
- Staff roles are limited to:
  - `owner`
  - `manager`
  - `front_desk`
- Public online booking requires:
  - guest full name
  - guest email
  - guest phone
  - check-in/check-out
  - payment information/details box
  - amount paid
  - payer name
  - mandatory payment proof upload
- Public booking does **not** ask for a specific payment channel yet. The guest writes payment information in the required payment details box.
- Staff-side payment records support payment method options:
  - cash
  - GCash
  - bank transfer
  - card
  - online gateway
  - Booking.com
  - Trip.com
  - other
- Tentative dates **do not block availability**.
- Payment-submitted dates **do not block availability**.
- Dates are blocked only when payment is confirmed and the reservation becomes `secured`.
- Tentative and payment-submitted inquiries still appear on the board so staff can follow up.
- Paid/secured bookings cannot overlap other secured or checked-in bookings for the same room.
- Email automation is **not used**. Instead, the reservation page has editable manual email drafts.
- Booking confirmation drafts are enabled only after the booking is secured.
- Daily sales/cash-count screen is included.

## Main features

- Supabase Auth login.
- Protected dashboard.
- Multi-hotel management.
- Room management per hotel.
- Staff-created tentative reservations.
- Public booking page per hotel:
  - `/book/navarro-hotel`
  - `/book/tagosilangan`
  - `/book/[hotelSlug]`
- Payment proof upload to a private Supabase Storage bucket.
- Payment review and confirmation.
- Status workflow:
  - `tentative`
  - `payment_submitted`
  - `secured`
  - `checked_in`
  - `checked_out`
  - `cancelled`
  - `no_show`
- Drag booking board at `/reservations`:
  - drag horizontally to change dates
  - drag vertically to change rooms
  - conflicts are checked against secured/checked-in reservations only
- Reservation detail page with:
  - balance calculation
  - payment proof list
  - manual house-rules email draft
  - manual booking-confirmation email draft
- Daily sales/cash count page at `/sales`:
  - daily ledger entries
  - collectibles/unpaid entries
  - cash denomination count
  - cash variance vs cash sales

## Project structure

```text
app/
  (protected)/dashboard       Staff dashboard
  (protected)/hotels          Hotel management
  (protected)/rooms           Room management
  (protected)/reservations    Gantt booking board and reservation details
  (protected)/payments        Payment proof list
  (protected)/sales           Daily sales and cash count
  book/[hotelSlug]            Public online booking page
  api/                        Server routes
components/                   UI components and forms
lib/                          Supabase, auth, date, money, booking helpers
supabase/migrations/          Database schema
supabase/seed.sql             Optional sample hotels/rooms
supabase/create-*.sql          Owner/staff profile helpers
```

## Supabase setup

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run:

```sql
supabase/migrations/0001_schema.sql
```

4. Optional: run:

```sql
supabase/seed.sql
```

5. In Supabase Auth, create your first user.
6. Copy that user's UUID.
7. Edit `supabase/create-owner-profile.sql` and replace the placeholder UUID.
8. Run `supabase/create-owner-profile.sql`.
9. Confirm Storage has a private bucket named `payment-proofs`. The migration creates it.

## Environment variables

Copy `.env.example` to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
APP_BASE_URL=http://localhost:3000
```

No email API key is required. Email drafts use `mailto:` links and copy-to-clipboard.

## Run locally or in GitHub Launcher

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Public booking pages after running the seed:

```text
http://localhost:3000/book/navarro-hotel
http://localhost:3000/book/tagosilangan
```

## GitHub Codespaces / Launcher

The project includes `.devcontainer/devcontainer.json`.

1. Open the repo in GitHub Launcher or Codespaces.
2. Add `.env.local` using the variables above.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the forwarded port `3000`.

## Payment workflow

1. Guest submits an online booking request and uploads proof.
2. Reservation status becomes `payment_submitted`.
3. The booking appears on the Gantt board for follow-up.
4. The room/date is **not blocked** yet.
5. Owner or manager reviews the payment proof.
6. If confirmed payments meet the required down payment, status becomes `secured`.
7. The secured booking now blocks the dates.
8. Staff opens the confirmation email draft, edits if needed, sends from their email app, and marks it as sent.

## Tentative booking rule

Tentative and payment-submitted inquiries are intentionally allowed to overlap. This matches the rule that unpaid inquiries can be overwritten by paid inquiries.

Database-level conflict prevention applies only to:

```text
secured
checked_in
```

## Manual email draft workflow

The app does not call an email API.

On each reservation detail page, staff can generate:

- house rules draft
- booking confirmation draft

Actions available:

- open prefilled email draft through `mailto:`
- copy the draft to clipboard
- mark the draft as sent inside the app

The booking confirmation draft is disabled until the reservation status is secured.

## Daily sales / cash count workflow

The `/sales` screen supports:

- selecting hotel and date
- adding room sales, deposits, add-ons, collectibles, and other ledger entries
- marking entries as collectible/unpaid
- entering bill/coin counts
- comparing counted cash against cash sales

Confirmed payment records also create ledger entries automatically.

## Staff profile setup

The first owner profile is created with `supabase/create-owner-profile.sql`.

For additional users:

1. Create the user in Supabase Auth.
2. Insert a row into `public.profiles` with one of these roles:
   - `owner`
   - `manager`
   - `front_desk`
3. For manager/front desk users, set `hotel_id` to the hotel they should access.
4. Owners can access all hotels.

## Current limits

- No automatic email API yet by request.
- No external payment gateway yet by request.
- Public booking payment method is not collected yet; guests enter payment information in the required details box.
- House rules are placeholder text until final rules are provided.
- Hotel contact information is optional until final official details are provided.
