# GitHub Launcher commands

After files are in the repo, run:

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Create `.env.local` first:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
APP_BASE_URL=http://localhost:3000
```

Supabase SQL setup order:

```text
1. supabase/migrations/0001_schema.sql
2. supabase/seed.sql optional
3. supabase/create-owner-profile.sql after editing the UUID
```
