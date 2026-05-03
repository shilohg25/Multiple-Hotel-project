-- Optional helper for adding manager or front desk users.
-- 1. Create the user in Supabase Auth.
-- 2. Copy the user's UUID.
-- 3. Copy the target hotel UUID from public.hotels.
-- 4. Replace the placeholders below.

insert into public.profiles (id, full_name, role, hotel_id)
values (
  '00000000-0000-0000-0000-000000000000',
  'Staff Name',
  'front_desk', -- owner | manager | front_desk
  '11111111-1111-1111-1111-111111111111' -- set null for owner only
)
on conflict (id) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  hotel_id = excluded.hotel_id;
