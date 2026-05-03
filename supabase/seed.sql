-- Optional sample inventory based on the attached Excel files.
-- Run after 0001_schema.sql. Rates are placeholders and should be edited.

do $$
declare
  navarro uuid;
  tago uuid;
  r text;
  n int;
begin
  select id into navarro from public.hotels where slug = 'navarro-hotel';
  select id into tago from public.hotels where slug = 'tagosilangan';

  if navarro is not null then
    for n in 201..205 loop
      insert into public.rooms (hotel_id, name, room_type_name, capacity, base_rate, sort_order)
      values (navarro, n::text, 'Regular', 2, 2500, n)
      on conflict (hotel_id, name) do nothing;
    end loop;
    for n in 301..305 loop
      insert into public.rooms (hotel_id, name, room_type_name, capacity, base_rate, sort_order)
      values (navarro, n::text, 'Regular', 2, 2500, n)
      on conflict (hotel_id, name) do nothing;
    end loop;
    for n in 401..405 loop
      insert into public.rooms (hotel_id, name, room_type_name, capacity, base_rate, sort_order)
      values (navarro, n::text, 'Regular', 2, 2500, n)
      on conflict (hotel_id, name) do nothing;
    end loop;
    for n in 501..505 loop
      insert into public.rooms (hotel_id, name, room_type_name, capacity, base_rate, sort_order)
      values (navarro, n::text, 'Regular', 2, 2500, n)
      on conflict (hotel_id, name) do nothing;
    end loop;
    for n in 601..605 loop
      insert into public.rooms (hotel_id, name, room_type_name, capacity, base_rate, sort_order)
      values (navarro, n::text, 'Regular', 2, 2500, n)
      on conflict (hotel_id, name) do nothing;
    end loop;
  end if;

  if tago is not null then
    foreach r in array array[
      'RM 102','RM 103','RM 104','RM 105 FAN ROOM','RM 106','RM 201 COUPLE','RM 202 COUPLE','RM 203','RM 301 FAMILY',
      'VIP 1 COUPLE','VIP 2 COUPLE','GLAMPING COUPLE A','GLAMPING COUPLE B','GLAMPING FAMILY A','GLAMPING FAMILY B',
      'GLAMPING BARKADA A -AIRCON','GLAMPING BARKADA B- AIRCON','GLAMPING BARKADA A- FAN','GLAMPING BARKADA B- FAN'
    ] loop
      insert into public.rooms (hotel_id, name, room_type_name, capacity, base_rate, sort_order)
      values (
        tago,
        r,
        case
          when r ilike '%BARKADA%' then 'Barkada'
          when r ilike '%FAMILY%' then 'Family'
          when r ilike '%VIP%' then 'VIP'
          when r ilike '%COUPLE%' then 'Couple'
          else 'Room'
        end,
        case
          when r ilike '%BARKADA%' then 6
          when r ilike '%FAMILY%' then 5
          else 2
        end,
        case
          when r ilike '%BARKADA%' then 4000
          when r ilike '%FAMILY%' then 5000
          when r ilike '%VIP%' then 3500
          when r ilike '%FAN%' then 1500
          else 2500
        end,
        100
      ) on conflict (hotel_id, name) do nothing;
    end loop;
  end if;
end $$;
