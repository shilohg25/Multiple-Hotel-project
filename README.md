# Multiple Hotel Booking App (Dynamic Next.js + Supabase)

This repository is a **real dynamic Next.js app** for hotel booking operations.

- ✅ Uses **Next.js App Router** + **TypeScript**
- ✅ Uses **Supabase Auth + Postgres + Storage**
- ✅ Runs in **GitHub Launcher/Codespaces** or hosts like **Vercel**
- ❌ **Not** built for GitHub Pages
- ❌ **No** static export (`output: "export"` is not used)

---

## What the app includes

- Multi-hotel support (starts with **Navarro Hotel** and **Tagosilangan**)
- Staff roles: `owner`, `manager`, `front_desk`
- Login page and protected staff pages
- Public booking pages with **required payment proof upload**
- Reservation statuses:
  - `tentative`
  - `payment_submitted`
  - `secured`
  - `checked_in`
  - `checked_out`
  - `cancelled`
  - `no_show`
- Payment review page for staff (confirm/reject payment, add notes)
- Gantt-style reservation board
- Manual email draft tools (copy + mailto, no email API)
- Daily sales/cash-count screen

---

## Important rule: date blocking

- `tentative` and `payment_submitted` bookings are visible but **do not block** dates.
- Only `secured` and `checked_in` bookings block dates.

---

## Required routes

- `/`
- `/login`
- `/dashboard`
- `/hotels`
- `/rooms`
- `/reservations`
- `/reservations/new`
- `/payments`
- `/board` (redirects to reservation board)
- `/sales`
- `/settings`
- `/book`
- `/book/[hotelSlug]`

---

## 1) Run in GitHub Launcher / Codespaces (recommended)

1. Open this repo in **GitHub Launcher** or **Codespaces**.
2. Wait for setup to finish (`postCreateCommand` runs `npm install`).
3. Create `.env.local` from `.env.example`.
4. Run:

```bash
npm run dev
```

5. Open the forwarded **Port 3000** URL (label: **Hotel Booking App**).

> Do not use localhost in your own browser when testing in Launcher/Codespaces. Use the forwarded GitHub URL for port 3000.

---

## 2) Environment variables

Copy `.env.example` to `.env.local` and fill values:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_BASE_URL=
```

For Codespaces/Launcher testing, `APP_BASE_URL` can be blank until you know the forwarded URL.

---

## 3) Supabase setup (SQL order)

In Supabase SQL Editor, run files in this order:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/seed.sql` (adds Navarro Hotel + Tagosilangan)
3. `supabase/create-owner-profile.sql` (after editing with your auth user UUID)

Optional later:
- `supabase/create-staff-profile-example.sql`

Storage bucket used by app:
- `payment-proofs`

---

## 4) Create first owner user

1. In Supabase Auth, create a user (email + password).
2. Copy the user UUID.
3. Paste UUID into `supabase/create-owner-profile.sql`.
4. Run the SQL.
5. Login at `/login` with that email/password.

If a profile is missing, the app shows a setup message.

---

## 5) NPM commands

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

App runs on:
- `0.0.0.0:3000`

---

## 6) Quick test checklist

### Public booking test
1. Open `/book` then choose a hotel, or open `/book/navarro-hotel`.
2. Fill all required fields.
3. Upload payment proof file (required).
4. Submit.
5. Confirm record appears as `payment_submitted` in staff pages.

### Payment confirmation test
1. Login as staff.
2. Open `/payments`.
3. Open payment proof.
4. Confirm payment.
5. Confirm reservation status changes to `secured`.

### Board test
1. Open `/board` or `/reservations`.
2. Confirm `tentative` and `payment_submitted` are visible but lighter.
3. Confirm only `secured`/`checked_in` block dates.

### Daily sales/cash-count test
1. Open `/sales`.
2. Create a record for a date/hotel.
3. Edit the record.
4. Verify totals and variance values update.

---

## Deployment note

Deploy this as a **Node-capable dynamic app** (example: Vercel). Do not deploy as GitHub Pages static site.
