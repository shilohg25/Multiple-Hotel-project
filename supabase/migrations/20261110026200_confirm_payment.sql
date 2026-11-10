-- Confirm a submitted payment and post its ledger row in one transaction.
-- The ledger date is the day the money is received, not the stay check-in date.
-- If the ledger insert fails, the confirmation is rolled back.

alter table public.payments
  add column if not exists received_on date;

create or replace function public.confirm_submitted_payment(
  p_payment_id uuid,
  p_actor uuid,
  p_entry_date date,
  p_received_on date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay public.payments%rowtype;
  stay public.reservations%rowtype;
  guest_name text;
  confirmed_total numeric;
  receipt_date date;
  status_updated boolean := false;
begin
  if p_entry_date is null and p_received_on is null then
    raise exception 'A received business date is required.' using errcode = '22023';
  end if;

  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  if pay.proof_path is null or btrim(pay.proof_path) = '' then
    raise exception 'Payment proof is mandatory before confirmation.' using errcode = '22023';
  end if;
  if pay.status is distinct from 'submitted' then
    raise exception 'Payment is not awaiting confirmation.' using errcode = 'P0001';
  end if;

  receipt_date := coalesce(p_received_on, p_entry_date);

  update public.payments
  set status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = p_actor,
      received_on = coalesce(p_received_on, received_on)
  where id = pay.id;

  select * into stay from public.reservations where id = pay.reservation_id;
  if not found then
    raise exception 'Reservation not found.' using errcode = 'P0002';
  end if;

  select coalesce(sum(amount), 0) into confirmed_total
  from public.payments
  where reservation_id = stay.id
    and status = 'confirmed';

  if confirmed_total >= coalesce(stay.downpayment_required, 0)
     and stay.status not in ('checked_in', 'checked_out') then
    update public.reservations
    set status = 'secured'
    where id = stay.id;
    status_updated := true;
  end if;

  select g.full_name into guest_name
  from public.guests g
  where g.id = stay.guest_id;

  insert into public.ledger_entries (
    hotel_id, reservation_id, entry_date, category, description,
    amount, payment_method, is_collectible, created_by
  ) values (
    stay.hotel_id,
    stay.id,
    receipt_date,
    'room_payment',
    'Confirmed payment for ' || coalesce(guest_name, 'guest') || ' (' || pay.id || ')',
    pay.amount,
    pay.method,
    false,
    p_actor
  );

  insert into public.audit_logs (hotel_id, reservation_id, actor_id, action, details)
  values (
    stay.hotel_id,
    stay.id,
    p_actor,
    'payment.confirmed',
    jsonb_build_object(
      'payment_id', pay.id,
      'confirmed_total', confirmed_total,
      'status_updated', status_updated,
      'entry_date', receipt_date
    )
  );

  return jsonb_build_object(
    'confirmed_total', confirmed_total,
    'status_updated', status_updated,
    'entry_date', receipt_date
  );
end;
$$;

revoke all on function public.confirm_submitted_payment(uuid, uuid, date, date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.confirm_submitted_payment(uuid, uuid, date, date) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.confirm_submitted_payment(uuid, uuid, date, date) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.confirm_submitted_payment(uuid, uuid, date, date) to service_role';
  end if;
end $$;
