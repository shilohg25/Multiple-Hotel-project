-- Non-destructive helper for checking whether hotels/properties have rooms/units.
-- Run manually in Supabase SQL Editor when auditing setup.

select
  h.id,
  h.name,
  h.slug,
  h.active,
  count(r.id) as total_rooms,
  count(r.id) filter (where r.active = true) as active_rooms,
  count(r.id) filter (where r.active = false) as inactive_rooms
from public.hotels h
left join public.rooms r on r.hotel_id = h.id
group by h.id, h.name, h.slug, h.active
order by h.name;

-- Example only. Replace HOTEL_ID_HERE and room details with real property data.
-- Do not run this unchanged.
--
-- insert into public.rooms (hotel_id, name, room_type_name, capacity, base_rate, sort_order, active)
-- values ('HOTEL_ID_HERE', 'Room 1', 'Standard', 2, 0, 100, true);
