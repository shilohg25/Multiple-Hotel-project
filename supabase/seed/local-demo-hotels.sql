-- LOCAL DEMO ONLY (DEMO_MODE=1, in-process PGlite). Never run against a Supabase project.
-- Runs right after 0001_schema.sql so later migrations backfill payment channels, services
-- and other per-hotel defaults for these TEST hotels exactly as they did for real hotels.
insert into public.hotels (id, name, slug, address, contact_email, contact_phone, default_currency, active)
values
  ('d0000000-0000-4000-8000-000000000001', 'TEST- Demo Hotel', 'test-demo-hotel', 'TEST- 1 Demo Street, Malay, Aklan', 'test-demo-hotel@example.test', '09000000000', 'PHP', true),
  ('d0000000-0000-4000-8000-000000000002', 'TEST- Demo Resort', 'test-demo-resort', 'TEST- 2 Demo Shore, Malay, Aklan', 'test-demo-resort@example.test', '09000000009', 'PHP', true)
on conflict (id) do nothing;
