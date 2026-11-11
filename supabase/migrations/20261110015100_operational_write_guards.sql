-- Role, day-lock, and audit guards for direct PostgREST writes.
-- Does not drop the permissive policies from 0001_schema.sql.
-- The Next.js API uses the service role, which bypasses RLS. Triggers still run.
-- When auth.uid() is null (service role), role checks are skipped so the API keeps working.
-- Day-lock checks still run. They no-op until public.day_closes exists.

create or replace function public.assert_business_day_open(target_hotel uuid, target_date date, target_outlet uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  locked boolean;
begin
  if target_hotel is null or target_date is null then
    return;
  end if;
  if to_regclass('public.day_closes') is null then
    return;
  end if;
  execute $sql$
    select exists (
      select 1
      from public.day_closes d
      where d.hotel_id = $1
        and d.business_date = $2
        and d.status = 'locked'
        and (d.outlet_id is null or ($3::uuid is not null and d.outlet_id = $3))
    )
  $sql$
  into locked
  using target_hotel, target_date, target_outlet;
  if locked then
    raise exception 'This day is locked. A manager has to unlock it before anything else can be entered.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.guard_direct_staff_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  actor_role text;
  row_new jsonb;
  row_old jsonb;
  target_hotel uuid;
  target_date date;
  target_outlet uuid;
  target_reservation uuid;
  hotel_tz text;
begin
  actor := auth.uid();
  row_new := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  actor_role := case when actor is null then null else public.current_app_role() end;

  if tg_table_name = 'reservations' then
    target_hotel := coalesce((row_new->>'hotel_id')::uuid, (row_old->>'hotel_id')::uuid);
    target_reservation := coalesce((row_new->>'id')::uuid, (row_old->>'id')::uuid);
    if actor is not null and actor_role not in ('owner', 'manager') then
      if tg_op = 'DELETE' then
        raise exception 'Only a manager can delete a reservation.' using errcode = '42501';
      elsif tg_op = 'UPDATE' then
        if (row_new->>'posted_room_rate') is distinct from (row_old->>'posted_room_rate')
           or (row_new->>'total_amount') is distinct from (row_old->>'total_amount')
           or (row_new->>'downpayment_required') is distinct from (row_old->>'downpayment_required') then
          raise exception 'Front desk cannot change the room rate, total, or down payment.' using errcode = '42501';
        end if;
        if (row_new->>'status') is distinct from (row_old->>'status') then
          if not (
            (row_old->>'status') in ('tentative', 'payment_submitted', 'secured') and (row_new->>'status') = 'checked_in'
            or (row_old->>'status') = 'checked_in' and (row_new->>'status') = 'checked_out'
          ) then
            raise exception 'Front desk can only check a guest in or out.' using errcode = '42501';
          end if;
        end if;
      end if;
    end if;
  elsif tg_table_name = 'payments' then
    target_reservation := coalesce((row_new->>'reservation_id')::uuid, (row_old->>'reservation_id')::uuid);
    select r.hotel_id, coalesce(h.timezone, 'Asia/Manila')
      into target_hotel, hotel_tz
    from public.reservations r
    join public.hotels h on h.id = r.hotel_id
    where r.id = target_reservation;
    target_date := ((coalesce((row_new->>'paid_at')::timestamptz, (row_old->>'paid_at')::timestamptz, now())) at time zone hotel_tz)::date;
    if actor is not null and actor_role not in ('owner', 'manager') then
      if tg_op = 'DELETE' then
        raise exception 'Only a manager can delete a payment.' using errcode = '42501';
      elsif tg_op = 'UPDATE' and (
        (row_new->>'status') is distinct from (row_old->>'status')
        or (row_new->>'amount') is distinct from (row_old->>'amount')
      ) then
        raise exception 'Only a manager can change a payment.' using errcode = '42501';
      elsif tg_op = 'INSERT' and coalesce(row_new->>'status', '') = 'confirmed' then
        raise exception 'Only a manager can confirm a payment.' using errcode = '42501';
      end if;
    end if;
    perform public.assert_business_day_open(target_hotel, target_date, null);
  elsif tg_table_name = 'ledger_entries' then
    target_hotel := coalesce((row_new->>'hotel_id')::uuid, (row_old->>'hotel_id')::uuid);
    target_date := coalesce((row_new->>'entry_date')::date, (row_old->>'entry_date')::date);
    target_outlet := nullif(coalesce(row_new->>'outlet_id', row_old->>'outlet_id'), '')::uuid;
    target_reservation := nullif(coalesce(row_new->>'reservation_id', row_old->>'reservation_id'), '')::uuid;
    if actor is not null and actor_role not in ('owner', 'manager') and tg_op in ('UPDATE', 'DELETE') then
      raise exception 'Only a manager can change a ledger row.' using errcode = '42501';
    end if;
    perform public.assert_business_day_open(target_hotel, target_date, target_outlet);
  elsif tg_table_name = 'cash_counts' then
    target_hotel := coalesce((row_new->>'hotel_id')::uuid, (row_old->>'hotel_id')::uuid);
    target_date := coalesce((row_new->>'count_date')::date, (row_old->>'count_date')::date);
    if actor is not null and actor_role not in ('owner', 'manager') and tg_op in ('UPDATE', 'DELETE') then
      raise exception 'Only a manager can change a saved cash count.' using errcode = '42501';
    end if;
    perform public.assert_business_day_open(target_hotel, target_date, null);
  elsif tg_table_name = 'reservation_charges' then
    target_hotel := coalesce((row_new->>'hotel_id')::uuid, (row_old->>'hotel_id')::uuid);
    target_reservation := nullif(coalesce(row_new->>'reservation_id', row_old->>'reservation_id'), '')::uuid;
    select coalesce(h.timezone, 'Asia/Manila') into hotel_tz from public.hotels h where h.id = target_hotel;
    target_date := (now() at time zone coalesce(hotel_tz, 'Asia/Manila'))::date;
    if actor is not null and actor_role not in ('owner', 'manager') and tg_op in ('UPDATE', 'DELETE') then
      raise exception 'Only a manager can change a posted charge.' using errcode = '42501';
    end if;
    perform public.assert_business_day_open(target_hotel, target_date, null);
  end if;

  if actor is not null then
    if actor is not null and not exists (select 1 from public.profiles p where p.id = actor) then
      actor := null;
    end if;
    insert into public.audit_logs (hotel_id, reservation_id, actor_id, action, details)
    values (
      target_hotel,
      case when tg_table_name = 'reservations' then target_reservation else target_reservation end,
      actor,
      tg_table_name || '.' || lower(tg_op),
      jsonb_build_object('source', 'postgrest', 'before', row_old, 'after', row_new)
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array['reservations', 'payments', 'ledger_entries', 'cash_counts', 'reservation_charges']
  loop
    if to_regclass('public.' || target) is null then
      continue;
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'guard_' || target || '_write') then
      execute format(
        'create trigger %I before insert or update or delete on public.%I for each row execute function public.guard_direct_staff_write()',
        'guard_' || target || '_write',
        target
      );
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservations' and policyname = 'frontline cannot delete reservations'
  ) then
    execute 'create policy "frontline cannot delete reservations" on public.reservations as restrictive for delete to authenticated using (public.current_app_role() in (''owner'', ''manager''))';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'payments' and policyname = 'frontline cannot delete payments'
  ) then
    execute 'create policy "frontline cannot delete payments" on public.payments as restrictive for delete to authenticated using (public.current_app_role() in (''owner'', ''manager''))';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ledger_entries' and policyname = 'frontline cannot delete ledger'
  ) then
    execute 'create policy "frontline cannot delete ledger" on public.ledger_entries as restrictive for delete to authenticated using (public.current_app_role() in (''owner'', ''manager''))';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cash_counts' and policyname = 'frontline cannot delete cash counts'
  ) then
    execute 'create policy "frontline cannot delete cash counts" on public.cash_counts as restrictive for delete to authenticated using (public.current_app_role() in (''owner'', ''manager''))';
  end if;
  if to_regclass('public.guests') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'guests' and policyname = 'guests only for their hotel'
  ) then
    execute $policy$
      create policy "guests only for their hotel"
      on public.guests
      as restrictive
      for all
      to authenticated
      using (
        public.current_app_role() = 'owner'
        or exists (
          select 1 from public.reservations r
          where r.guest_id = guests.id
            and public.can_access_hotel(r.hotel_id)
        )
      )
      with check (
        public.current_app_role() = 'owner'
        or exists (
          select 1 from public.reservations r
          where r.guest_id = guests.id
            and public.can_access_hotel(r.hotel_id)
        )
      )
    $policy$;
  end if;
end $$;

-- Default privileges grant EXECUTE to PUBLIC, anon, and authenticated.
-- RLS policies in this file call current_app_role and can_access_hotel, not these two.
-- assert_business_day_open is only called from the security-definer guard, so service_role is enough.
-- guard_direct_staff_write fires as the role that writes the row, so authenticated needs EXECUTE too.
revoke all on function public.assert_business_day_open(uuid, date, uuid) from public;
revoke all on function public.guard_direct_staff_write() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.assert_business_day_open(uuid, date, uuid) from anon';
    execute 'revoke all on function public.guard_direct_staff_write() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.assert_business_day_open(uuid, date, uuid) from authenticated';
    execute 'revoke all on function public.guard_direct_staff_write() from authenticated';
    execute 'grant execute on function public.guard_direct_staff_write() to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.assert_business_day_open(uuid, date, uuid) to service_role';
    execute 'grant execute on function public.guard_direct_staff_write() to service_role';
  end if;
end $$;
