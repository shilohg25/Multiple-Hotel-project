-- PR0.5 cashier and restaurant_staff.
-- Adds enum labels. Those labels cannot be removed later.
-- Restrictive policies tighten direct client access. The service-role API checks roles in code.

alter type public.app_role add value if not exists 'cashier';
alter type public.app_role add value if not exists 'restaurant_staff';

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role::text from public.profiles p where p.id = auth.uid()
$$;

-- Restrictive write policies. SELECT stays open to existing permissive policies
-- so the front desk can still read rooms and hotels. Writes from the browser
-- require manager or owner, and hotel or profile writes require owner.

do $$
declare
  target text;
  writers text;
  action text;
begin
  foreach target in array array['hotels', 'profiles', 'room_types', 'rooms', 'service_items', 'room_type_channel_rates', 'payment_channels']
  loop
    if to_regclass('public.' || target) is null then
      continue;
    end if;
    writers := case when target in ('hotels', 'profiles') then '(''owner'')' else '(''owner'', ''manager'')' end;
    foreach action in array array['insert', 'update', 'delete']
    loop
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = target and policyname = 'role write ' || target || ' ' || action
      ) then
        if action = 'insert' then
          execute format(
            'create policy %I on public.%I as restrictive for insert to authenticated with check (public.current_app_role() in %s)',
            'role write ' || target || ' insert', target, writers
          );
        elsif action = 'update' then
          execute format(
            'create policy %I on public.%I as restrictive for update to authenticated using (public.current_app_role() in %s) with check (public.current_app_role() in %s)',
            'role write ' || target || ' update', target, writers, writers
          );
        else
          execute format(
            'create policy %I on public.%I as restrictive for delete to authenticated using (public.current_app_role() in %s)',
            'role write ' || target || ' delete', target, writers
          );
        end if;
      end if;
    end loop;
  end loop;
end $$;
