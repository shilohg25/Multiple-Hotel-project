-- Restores the guard function from 20261110015100_operational_write_guards.sql.

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

