-- Tightens the direct-write guard from 20261110015100.
-- Does not edit that file. Replaces the function in place.
-- Front desk may only check a guest in or out.
-- Confirming or rejecting a payment is not day-locked. The ledger row is.
-- nights is a generated column and is left out of the staff column check.
-- Ledger inserts must name the signed-in staff member, use a positive amount, and belong to an accessible hotel.

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
  entry_amount numeric;
  entry_category text;
begin
  actor := auth.uid();
  row_new := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  actor_role := case when actor is null then null else public.current_app_role() end;

  if tg_table_name = 'reservations' then
    target_hotel := coalesce((row_new->>'hotel_id')::uuid, (row_old->>'hotel_id')::uuid);
    target_reservation := coalesce((row_new->>'id')::uuid, (row_old->>'id')::uuid);
    -- Front desk, cashier, and restaurant staff may only check a guest in or out.
    -- Managers and owners may change the stay. Day locks still apply to ledger rows,
    -- cash counts, and folio charges. nights is generated and is null in NEW here.
    if actor is not null and actor_role not in ('owner', 'manager') then
      if tg_op = 'DELETE' then
        raise exception 'Only a manager can delete a reservation.' using errcode = '42501';
      elsif tg_op = 'UPDATE' then
        if exists (
          select 1
          from jsonb_each(row_old) as old_field
          full outer join jsonb_each(row_new) as new_field using (key)
          where key not in ('status', 'updated_at', 'nights')
            and old_field.value is distinct from new_field.value
        ) then
          raise exception 'Front desk can only check a guest in or out.' using errcode = '42501';
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
    -- Confirming or rejecting a submitted payment is not a day-lock check.
    -- The ledger row for the date the money is received is what the lock covers.
    select r.hotel_id
      into target_hotel
    from public.reservations r
    where r.id = target_reservation;
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
    -- No day lock on the payment row. A public booking insert and a confirm or reject
    -- must not fail because a stay date or a submission date is locked.
  elsif tg_table_name = 'ledger_entries' then
    target_hotel := coalesce((row_new->>'hotel_id')::uuid, (row_old->>'hotel_id')::uuid);
    target_date := coalesce((row_new->>'entry_date')::date, (row_old->>'entry_date')::date);
    target_outlet := nullif(coalesce(row_new->>'outlet_id', row_old->>'outlet_id'), '')::uuid;
    target_reservation := nullif(coalesce(row_new->>'reservation_id', row_old->>'reservation_id'), '')::uuid;
    if actor is not null and actor_role not in ('owner', 'manager') and tg_op in ('UPDATE', 'DELETE') then
      raise exception 'Only a manager can change a ledger row.' using errcode = '42501';
    end if;
    if actor is not null and tg_op = 'INSERT' then
      if not public.can_access_hotel(target_hotel) then
        raise exception 'You cannot post a ledger row for this hotel.' using errcode = '42501';
      end if;
      if nullif(row_new->>'created_by', '') is null
         or (row_new->>'created_by')::uuid is distinct from actor then
        raise exception 'A ledger row must be created by the signed-in staff member.' using errcode = '42501';
      end if;
      entry_amount := coalesce((row_new->>'amount')::numeric, 0);
      entry_category := lower(coalesce(row_new->>'category', ''));
      if entry_category in ('expense', 'expenses') then
        if entry_amount <= 0 then
          raise exception 'An expense must be a positive amount.' using errcode = '23514';
        end if;
      elsif entry_amount <= 0 then
        raise exception 'A sale, deposit, or collectible must be a positive amount.' using errcode = '23514';
      end if;
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

-- Keep the same execute rights after replacing the guard body.
-- anon and PUBLIC cannot run it. authenticated can, because a signed-in write fires the trigger.
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

