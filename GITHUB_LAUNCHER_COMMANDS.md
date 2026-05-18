# Local development commands

Run these from the repo in VS Code:

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Create `.env.local` first:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
APP_BASE_URL=https://multiple-hotel-project.vercel.app
```

For local-only testing, `APP_BASE_URL` may point at the local Next.js dev server. For production, set it to the Vercel URL.

Supabase SQL setup order:

```text
1. supabase/migrations/0001_schema.sql if the schema is not already installed
2. supabase/seed.sql only if hotels or rooms are missing
3. supabase/create-owner-profile.sql after editing the UUID
```
