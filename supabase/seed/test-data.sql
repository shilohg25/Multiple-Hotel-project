-- Fake data only. Every name is prefixed TEST-.
-- No passwords are stored here.
--
-- Staff profiles attach to these auth users by email. Create them in Supabase
-- Authentication (or let the local stub insert below) before expecting profiles:
--   test-owner@example.test
--   test-manager@example.test
--   test-front-desk@example.test

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'encrypted_password'
  ) then
    insert into auth.users (id, email) values
      ('10000000-0000-4000-8000-000000000001', 'test-owner@example.test'),
      ('10000000-0000-4000-8000-000000000002', 'test-manager@example.test'),
      ('10000000-0000-4000-8000-000000000003', 'test-front-desk@example.test')
    on conflict (id) do update set email = excluded.email;
  end if;
end $$;

insert into public.hotels (
  id, name, slug, address, contact_email, contact_phone, default_currency, timezone, active
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'TEST- Practice Hotel',
    'test-practice-hotel',
    'TEST- 1 Sample Street, Malay, Aklan',
    'test-hotel@example.test',
    '09000000000',
    'PHP',
    'Asia/Manila',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'TEST- Practice Resort',
    'test-practice-resort',
    'TEST- 2 Sample Shore, Malay, Aklan',
    'test-resort@example.test',
    '09000000009',
    'PHP',
    'Asia/Manila',
    true
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  timezone = excluded.timezone,
  active = excluded.active;

insert into public.profiles (id, full_name, role, hotel_id)
select u.id, 'TEST- Owner', 'owner', null
from auth.users u
where u.email = 'test-owner@example.test'
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, hotel_id = excluded.hotel_id;

insert into public.profiles (id, full_name, role, hotel_id)
select u.id, 'TEST- Manager', 'manager', '11111111-1111-4111-8111-111111111111'
from auth.users u
where u.email = 'test-manager@example.test'
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, hotel_id = excluded.hotel_id;

insert into public.profiles (id, full_name, role, hotel_id)
select u.id, 'TEST- Front Desk', 'front_desk', '11111111-1111-4111-8111-111111111111'
from auth.users u
where u.email = 'test-front-desk@example.test'
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, hotel_id = excluded.hotel_id;

insert into public.room_types (id, hotel_id, name, base_rate, capacity, active)
values
  ('11111111-1111-4111-8111-111111111201', '11111111-1111-4111-8111-111111111111', 'TEST- Deluxe Queen', 2250, 2, true)
on conflict (id) do update set name = excluded.name, base_rate = excluded.base_rate;

insert into public.rooms (id, hotel_id, room_type_id, name, room_type_name, capacity, base_rate, sort_order, active)
values
  (
    '11111111-1111-4111-8111-111111111301',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111201',
    'TEST- 201',
    'TEST- Deluxe Queen',
    2,
    2250,
    201,
    true
  )
on conflict (id) do update set name = excluded.name, base_rate = excluded.base_rate;

insert into public.outlets (id, hotel_id, name, slug, outlet_type, active, legal_name, is_reporting_unit)
values (
  '11111111-1111-4111-8111-111111111501',
  '11111111-1111-4111-8111-111111111111',
  'TEST- Practice Café',
  'test-practice-cafe',
  'restaurant',
  true,
  'TEST- Practice Corp',
  true
)
on conflict (id) do update set name = excluded.name, is_reporting_unit = true;

do $$
begin
  if to_regclass('public.room_type_channel_rates') is not null then
    insert into public.room_type_channel_rates (room_type_id, channel, rate)
    values
      ('11111111-1111-4111-8111-111111111201', 'walk_in', 2250),
      ('11111111-1111-4111-8111-111111111201', 'ota', 2520),
      ('11111111-1111-4111-8111-111111111201', 'short_time', 1500)
    on conflict (room_type_id, channel) do nothing;
  end if;
end $$;

insert into public.guests (id, full_name, email, phone, notes)
values (
  '11111111-1111-4111-8111-111111111401',
  'TEST- Guest Ada',
  'test-ada@example.test',
  '09000000001',
  'TEST- fake guest for training'
)
on conflict (id) do update set full_name = excluded.full_name, email = excluded.email;
