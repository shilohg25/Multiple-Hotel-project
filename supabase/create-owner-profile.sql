-- After creating your first user in Supabase Auth, copy the user's UUID and run this.
-- Replace the UUID and name.

insert into public.profiles (id, full_name, role, hotel_id)
values ('00000000-0000-0000-0000-000000000000', 'Owner', 'owner', null)
on conflict (id) do update set role = 'owner', full_name = excluded.full_name, hotel_id = null;
