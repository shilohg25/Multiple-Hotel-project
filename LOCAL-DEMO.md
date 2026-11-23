# Local demo mode (DEMO_MODE=1)

A self-contained copy of the app for tutorials and training. It runs with `next dev` on one
machine, against an **in-process Postgres (PGlite, WebAssembly)** built from
`supabase/migrations/` plus TEST- seed data. There is no Supabase project, no Docker and no network.

**Local only. Never deploy this mode, and never add DEMO_MODE to Vercel.**

## Run it

```bash
npm ci
npm run demo:setup     # random passwords -> ~/.secrets/hotel-demo-logins.txt (chmod 600)
                       # scrypt hashes  -> .demo/logins.json (gitignored)
env -i HOME="$HOME" PATH="$PATH" npm run demo     # http://127.0.0.1:3100
```

`env -i` starts from an empty environment. That matters on machines that hold Supabase or
Vercel tokens in the shell, because the guard refuses to start while any of them are visible.

Data lives in memory. Restarting the server resets everything to the seed, so it is safe to
click Confirm, Approve, Lock and so on while recording.

## Logins (5)

owner, manager, front desk, cashier and restaurant staff (`demo-*@example.test`). The passwords
are only in the logins file. Staff are assigned to **TEST- Demo Hotel**. The owner also sees **TEST- Demo Resort**.

## Seeded for today (Asia/Manila business date)

- Arrival today: TEST- Ada Arrival (room TEST- 201, secured)
- In house: TEST- Ben In-House (TEST- 202)
- Departure today: TEST- Cora Departure (TEST- 301), with a pending late check-out request
- Pending payment proof: TEST- Dan Online (bank transfer, submitted)
- Pending price-change (rate override) request on Ada's stay
- Completed day close for yesterday: locked, balanced (cash 4,500 + GCash 1,000)

## Safety gates

1. `next.config.mjs` and `lib/demo/preload.mjs` (loaded into every Node process through
   `NODE_OPTIONS=--import`) throw at startup when DEMO_MODE=1 and any of these is true:
   - any `*SUPABASE*`, `*SERVICE_ROLE*`, `SBP_*` or `SB_*` variable is set
   - any variable value mentions `supabase.co` or a live project ref
   - any `VERCEL*` variable is set
   - `NODE_ENV=production` (so `next build` and `next start` refuse)
2. Every demo process is offline. `fetch` and DNS to anything except loopback are refused, and
   Supabase hosts get their own message. Refusals are logged to `.demo/network.log`.
3. `lib/supabase-admin.ts` and `lib/supabase-server.ts` return the local PGlite client in demo
   mode. They never call `createClient` with a URL.
4. The server binds to 127.0.0.1 only.

## Smoke tests

```bash
node scripts/demo-smoke.mjs            # every role: login + main screens + manager-only gating
node scripts/demo-actions-smoke.mjs    # writes: confirm proof, approve requests, check-in, staff roles
```

## Limits

- The schema comes from the migrations in this repo. If live was changed by hand, the demo may differ.
- Emails (Resend) are not sent: the demo is offline.
- Storage is in memory. Two seeded proofs are TEST- placeholder images.
- `auth.admin` is not available. Staff logins are the five above.
