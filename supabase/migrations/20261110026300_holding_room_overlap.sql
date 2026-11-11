-- Stop two holding stays from occupying the same room and dates.
-- Holding means secured, checked in, or a submitted online payment.
-- Does not change the older prevent_secured_room_overlap constraint.
-- Not applied until approved.

create extension if not exists btree_gist;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prevent_holding_room_overlap'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint prevent_holding_room_overlap
      exclude using gist (
        room_id with =,
        daterange(check_in, check_out, '[)') with &&
      ) where (status in ('secured', 'checked_in', 'payment_submitted'));
  end if;
end $$;
