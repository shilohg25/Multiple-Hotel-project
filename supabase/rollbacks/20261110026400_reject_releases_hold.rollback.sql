-- Restore the reject function from 20261110026200, which does not change the stay.
-- That also removes the later rule that cancels only when no other payment is submitted or confirmed.
-- Execute stays limited to service_role.

create or replace function public.reject_submitted_payment(
  p_payment_id uuid,
  p_actor uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay public.payments%rowtype;
  stay public.reservations%rowtype;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to reject a payment.' using errcode = '22023';
  end if;

  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;
  if pay.status is distinct from 'submitted' then
    raise exception 'Payment is not awaiting confirmation.' using errcode = 'P0001';
  end if;

  update public.payments
  set status = 'rejected',
      rejection_reason = btrim(p_reason)
  where id = pay.id;

  select * into stay from public.reservations where id = pay.reservation_id;

  insert into public.audit_logs (hotel_id, reservation_id, actor_id, action, details)
  values (
    stay.hotel_id,
    pay.reservation_id,
    p_actor,
    'payment.rejected',
    jsonb_build_object('payment_id', pay.id, 'reason', btrim(p_reason))
  );

  return jsonb_build_object('status', 'rejected', 'payment_id', pay.id);
end;
$$;

revoke all on function public.reject_submitted_payment(uuid, uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.reject_submitted_payment(uuid, uuid, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.reject_submitted_payment(uuid, uuid, text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.reject_submitted_payment(uuid, uuid, text) to service_role';
  end if;
end $$;
