-- Approve or reject a rate request in one transaction.
-- If the stay update fails, the request stays pending. The audit stores the previous total.

create or replace function public.review_rate_override(
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
  req public.rate_override_requests%rowtype;
  stay public.reservations%rowtype;
  prev_rate numeric;
  prev_total numeric;
  new_total numeric;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected.' using errcode = '22023';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'A manager note is required.' using errcode = '22023';
  end if;

  update public.rate_override_requests
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

  if req.reservation_id is not null then
    select * into stay from public.reservations where id = req.reservation_id;
    if not found then
      raise exception 'Reservation not found.' using errcode = 'P0002';
    end if;
    prev_rate := stay.posted_room_rate;
    prev_total := stay.total_amount;
    if p_decision = 'approved' then
      new_total := round((req.requested_rate * coalesce(stay.nights, 0) + coalesce(stay.surcharge_amount, 0)) * 100) / 100;
      update public.reservations
      set posted_room_rate = req.requested_rate,
          total_amount = new_total
      where id = stay.id;
    end if;
  end if;

  insert into public.audit_logs (hotel_id, reservation_id, actor_id, action, details)
  values (
    req.hotel_id,
    req.reservation_id,
    p_actor,
    'rate.override_' || p_decision,
    jsonb_build_object(
      'request_id', req.id,
      'before', jsonb_build_object(
        'status', 'pending',
        'posted_room_rate', prev_rate,
        'total_amount', prev_total
      ),
      'after', jsonb_build_object(
        'status', p_decision,
        'requested_rate', req.requested_rate,
        'total_amount', case when p_decision = 'approved' then new_total else null end
      ),
      'reason', req.reason,
      'review_note', btrim(p_note)
    )
  );

  return jsonb_build_object(
    'id', req.id,
    'status', p_decision,
    'hotel_id', req.hotel_id,
    'reservation_id', req.reservation_id,
    'previous_total', prev_total,
    'total_amount', new_total
  );
end;
$$;

revoke all on function public.review_rate_override(uuid, text, text, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.review_rate_override(uuid, text, text, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.review_rate_override(uuid, text, text, uuid) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.review_rate_override(uuid, text, text, uuid) to service_role';
  end if;
end $$;
