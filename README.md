# Multiple Hotel Booking App

This is a dynamic Next.js + Supabase hotel booking app for Vercel. It uses Next.js App Router, protected staff pages, API routes, Supabase Auth, Supabase Postgres, and Supabase Storage for payment proof uploads.

## Do Not Use GitHub Pages

Do not use this old GitHub Pages/static hosting URL:

```text
https://shilohg25.github.io/Multiple-Hotel-project/
```

That setup was for static hosting. This app needs a real dynamic Next.js host such as Vercel.

## Development Workflow

1. Open the cloned repo in VS Code.
2. Make changes with Codex inside VS Code.
3. Run:

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

4. Commit changes in GitHub Desktop.
5. Push to GitHub.
6. Vercel auto-deploys from GitHub.

## Vercel Setup

1. Go to Vercel.
2. Choose Add New Project.
3. Import `shilohg25/Multiple-Hotel-project`.
4. Set Framework Preset to `Next.js`.
5. Set Build Command to `npm run build`.
6. Set Install Command to `npm install`.
7. Leave Output Directory blank/default.
8. Add the required environment variables.

Use the actual Vercel production URL for `APP_BASE_URL`. A custom domain can be used later.

## Vercel Environment Variables

Add every variable in Vercel:

Vercel -> Project -> Settings -> Environment Variables

1. Add each variable to Production, Preview, and Development.
2. Save.
3. Redeploy the latest deployment.

Required variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_BASE_URL=https://multiple-hotel-project.vercel.app
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are needed for login and Supabase browser/server auth.

`SUPABASE_SERVICE_ROLE_KEY` is needed by server-side protected staff/admin reads. Never expose it in client components.

`APP_BASE_URL` should be the production Vercel URL, for example `https://multiple-hotel-project.vercel.app`.

After adding or changing Vercel environment variables, redeploy. Old Vercel deployments do not receive newly added environment values automatically.

## Supabase Setup

Run the schema migration only if it has not already been run:

```text
supabase/migrations/0001_schema.sql
```

Run seed data only if hotels or rooms are missing:

```text
supabase/seed.sql
```

Create the first owner:

1. Create the owner user in Supabase Auth.
2. Copy that user's UUID.
3. Edit `supabase/create-owner-profile.sql` with the UUID.
4. Run the SQL to create the owner profile in the `profiles` table.

If a user can log in but reaches `/profile-missing`, their Supabase Auth user exists but their staff profile is missing. Create a profile with one of these roles: `owner`, `manager`, or `front_desk`.

Owner profile SQL example:

```sql
insert into public.profiles (id, full_name, role, hotel_id)
select
  u.id,
  'Owner',
  'owner'::public.app_role,
  null
from auth.users u
where lower(u.email) = lower('YOUR_EMAIL_HERE')
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = 'owner'::public.app_role,
  hotel_id = null;
```

The app uses the `payment-proofs` Supabase Storage bucket. Do not delete existing data, reset the database, or expose `SUPABASE_SERVICE_ROLE_KEY` in client components.

## Environment Variables

Copy `.env.example` to `.env.local` for local development and fill in the values. Never commit `.env.local`.

`NEXT_PUBLIC_SUPABASE_URL` is the public Supabase project URL and is safe for browser use.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is the public anon key and is safe for browser use when RLS is enabled.

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Use it only in server routes and server modules.

`APP_BASE_URL` is the deployed app URL, for example:

```text
https://multiple-hotel-project.vercel.app
```

## Troubleshooting

`/api/health` is the first URL to test after deployment. It returns booleans for whether each required environment variable is present without exposing secret values.

Protected staff pages are guarded by `app/(protected)/layout.tsx` and `requireStaff()`. There is no middleware file in this app.

HTTP 405 on `/login` after sign-out usually means the sign-out POST redirect was followed as a POST. The sign-out route returns HTTP 303 so the browser follows the redirect as a GET.

Redirect loops after login usually mean the user exists in Supabase Auth but has no matching row in `public.profiles`. The app sends that user to `/profile-missing`.

If middleware works but protected pages fail, check `SUPABASE_SERVICE_ROLE_KEY` in Vercel.

After changing Vercel environment variables, redeploy the latest deployment.

`favicon.ico` 404 warnings are harmless. This repo includes an app icon so browsers have a basic favicon.

## Testing Checklist

After deployment or local startup, test:

- `/api/health`
- `/login`
- `/profile-missing`
- `/dashboard`
- `/hotels`
- `/rooms`
- `/reservations`
- `/reservations/new`
- `/payments`
- `/board`
- `/sales`
- `/book`
- `/book/navarro-hotel`
- `/book/tagosilangan`

## Business Rules

- Tentative bookings do not block dates.
- Payment-submitted bookings do not block dates.
- Only secured and checked-in bookings block dates.
- Payment proof is mandatory for payment submission.
- Public booking submissions become `payment_submitted`, not `secured`.
- Staff must confirm payment before a booking becomes `secured`.
- Staff roles are `owner`, `manager`, and `front_desk`.
- Email tools create manual drafts only. There is no email API yet.
- There is no payment gateway yet.
