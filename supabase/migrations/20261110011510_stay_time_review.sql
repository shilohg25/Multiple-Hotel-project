-- Approve or reject an early/late charge in one transaction.
-- If the folio insert fails, the request stays pending.

create or replace function public.review_stay_time_request(
  p_request_id uuid,
  p_decision text,
  p_note text,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.stay_time_requests%rowtype;
  service_name text;
  service_id uuid;
  service_category text;
  charge_category text;
  charge_amount numeric;
  charge_description text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected.' using errcode = '22023';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'A manager note is required.' using errcode = '22023';
  end if;

  update public.stay_time_requests
  set status = p_decision,
      review_note = btrim(p_note),
      reviewed_by = p_actor,
      reviewed_at = now()
  where id = p_request_id
    and status = 'pending'
  returning * into req;

  if not found then
    raise exception 'This request was already reviewed.' using errcode = 'P0001';
  end if;

  if p_decision = 'approved' then
    service_name := case when req.kind = 'early_check_in' then 'Early check-in' else 'Late checkout' end;
    charge_category := case when req.kind = 'early_check_in' then 'early_checkin' else 'late_checkout' end;
    select s.id, s.category into service_id, service_category
    from public.service_items s
    where s.hotel_id = req.hotel_id
      and s.name ilike service_name
    limit 1;
    if service_category is not null then
      charge_category := service_category;
    end if;
    charge_amount := round(req.hours * req.hourly_rate * 100) / 100;
    charge_description := service_name || ' ' || req.hours || ' hour(s) at ' || req.hourly_rate;
    begin
      insert into public.reservation_charges (
        reservation_id, hotel_id, service_item_id, description, category,
        quantity, unit_price, total_amount, notes, created_by
      ) values (
        req.reservation_id, req.hotel_id, service_id, charge_description, charge_category,
        req.hours, req.hourly_rate, charge_amount, req.reason, p_actor
      );
    exception
      when others then
        if sqlerrm ilike '%generated%' or sqlerrm ilike '%total_amount%' then
          insert into public.reservation_charges (
            reservation_id, hotel_id, service_item_id, description, category,
            quantity, unit_price, notes, created_by
          ) values (
            req.reservation_id, req.hotel_id, service_id, charge_description, charge_category,
            req.hours, req.hourly_rate, req.reason, p_actor
          );
        else
          raise;
        end if;
    end;
  end if;

  insert into public.audit_logs (hotel_id, reservation_id, actor_id, action, details)
  values (
    req.hotel_id,
    req.reservation_id,
    p_actor,
    'stay_time.' || p_decision,
    jsonb_build_object(
      'request_id', req.id,
      'before', jsonb_build_object('status', 'pending'),
      'after', jsonb_build_object('status', p_decision, 'amount', charge_amount),
      'reason', req.reason,
      'review_note', btrim(p_note)
    )
  );

  return jsonb_build_object('id', req.id, 'status', p_decision, 'hotel_id', req.hotel_id, 'reservation_id', req.reservation_id);
end;
$$;

revoke all on function public.review_stay_time_request(uuid, text, text, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.review_stay_time_request(uuid, text, text, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.review_stay_time_request(uuid, text, text, uuid) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.review_stay_time_request(uuid, text, text, uuid) to service_role';
  end if;
end $$;
