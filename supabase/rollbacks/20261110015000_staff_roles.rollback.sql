-- Drops the restrictive policies from PR0.5.
-- Enum values cashier and restaurant_staff cannot be removed without recreating the type.

do $$
declare
  target text;
  action text;
begin
  foreach target in array array['hotels', 'profiles', 'room_types', 'rooms', 'service_items', 'room_type_channel_rates', 'payment_channels']
  loop
    foreach action in array array['insert', 'update', 'delete']
    loop
      execute format('drop policy if exists %I on public.%I', 'role write ' || target || ' ' || action, target);
    end loop;
  end loop;
end $$;

drop function if exists public.current_app_role();
