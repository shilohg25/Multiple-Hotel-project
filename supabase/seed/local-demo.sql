-- LOCAL DEMO ONLY (DEMO_MODE=1, in-process PGlite). Never run against a Supabase project.
-- Fake data; every name is prefixed TEST-. Dates are relative to today in Asia/Manila.
-- auth.users and profiles for the 5 demo logins are inserted by lib/demo/db.ts.

-- The 0001 migration inserts the two real hotel names; the local demo keeps only TEST hotels.
delete from public.hotels where slug not like 'test-demo-%';

update public.hotels set
  check_in_time = '14:00', check_out_time = '12:00', timezone = 'Asia/Manila',
  legal_name = 'TEST- Demo Corp', booking_email = 'test-demo-bookings@example.test'
where slug like 'test-demo-%';

do $$
declare
  hotel uuid := 'd0000000-0000-4000-8000-000000000001';
  resort uuid := 'd0000000-0000-4000-8000-000000000002';
  owner_id uuid := 'd1000000-0000-4000-8000-000000000001';
  manager_id uuid := 'd1000000-0000-4000-8000-000000000002';
  desk_id uuid := 'd1000000-0000-4000-8000-000000000003';
  today date := (now() at time zone 'Asia/Manila')::date;
  deluxe uuid := 'd2000000-0000-4000-8000-000000000001';
  family uuid := 'd2000000-0000-4000-8000-000000000002';
  cottage uuid := 'd2000000-0000-4000-8000-000000000003';
  cafe uuid := 'd3000000-0000-4000-8000-000000000001';
  close_id uuid := 'd9000000-0000-4000-8000-000000000001';
  n int;
begin
  insert into public.room_types (id, hotel_id, name, base_rate, capacity, active) values
    (deluxe, hotel, 'TEST- Deluxe Queen', 2250, 2, true),
    (family, hotel, 'TEST- Family Room', 3500, 4, true),
    (cottage, resort, 'TEST- Garden Cottage', 3000, 3, true);
  insert into public.room_type_channel_rates (room_type_id, channel, rate) values
    (deluxe, 'walk_in', 2250), (deluxe, 'ota', 2520), (deluxe, 'short_time', 1500),
    (family, 'walk_in', 3500), (family, 'ota', 3900), (family, 'short_time', 2200),
    (cottage, 'walk_in', 3000), (cottage, 'ota', 3360), (cottage, 'short_time', 1800)
  on conflict (room_type_id, channel) do nothing;

  for n in 201..206 loop
    insert into public.rooms (id, hotel_id, room_type_id, name, room_type_name, capacity, base_rate, sort_order)
    values (('d4000000-0000-4000-8000-000000000' || n)::uuid, hotel, deluxe, 'TEST- ' || n, 'TEST- Deluxe Queen', 2, 2250, n);
  end loop;
  for n in 301..302 loop
    insert into public.rooms (id, hotel_id, room_type_id, name, room_type_name, capacity, base_rate, sort_order)
    values (('d4000000-0000-4000-8000-000000000' || n)::uuid, hotel, family, 'TEST- ' || n, 'TEST- Family Room', 4, 3500, n);
  end loop;
  for n in 101..102 loop
    insert into public.rooms (id, hotel_id, room_type_id, name, room_type_name, capacity, base_rate, sort_order)
    values (('d4000000-0000-4000-8000-000000000' || n)::uuid, resort, cottage, 'TEST- Cottage ' || n, 'TEST- Garden Cottage', 3, 3000, n);
  end loop;

  insert into public.outlets (id, hotel_id, name, slug, outlet_type, active, legal_name, is_reporting_unit)
  values (cafe, hotel, 'TEST- Demo Café', 'test-demo-cafe', 'restaurant', true, 'TEST- Demo Café Corp', true)
  on conflict (hotel_id, slug) do nothing;

  insert into public.guests (id, full_name, email, phone, notes) values
    ('d5000000-0000-4000-8000-000000000001', 'TEST- Ada Arrival', 'test-ada@example.test', '09000000001', 'TEST- arrives today'),
    ('d5000000-0000-4000-8000-000000000002', 'TEST- Ben In-House', 'test-ben@example.test', '09000000002', 'TEST- staying over'),
    ('d5000000-0000-4000-8000-000000000003', 'TEST- Cora Departure', 'test-cora@example.test', '09000000003', 'TEST- leaves today'),
    ('d5000000-0000-4000-8000-000000000004', 'TEST- Dan Online', 'test-dan@example.test', '09000000004', 'TEST- online booking, proof sent'),
    ('d5000000-0000-4000-8000-000000000005', 'TEST- Eve Resort', 'test-eve@example.test', '09000000005', 'TEST- resort guest');

  -- Arrival today (secured, down payment confirmed earlier)
  insert into public.reservations (id, hotel_id, room_id, guest_id, status, booking_source, check_in, check_out, guest_count, with_breakfast, posted_room_rate, total_amount, downpayment_required, mode_of_payment, created_by, created_at)
  values ('d6000000-0000-4000-8000-000000000001', hotel, 'd4000000-0000-4000-8000-000000000201', 'd5000000-0000-4000-8000-000000000001', 'secured', 'walk_in', today, today + 2, 2, true, 2250, 5500, 2750, 'cash', desk_id, now() - interval '5 days');
  -- In-house guest (checked in yesterday, leaves tomorrow)
  insert into public.reservations (id, hotel_id, room_id, guest_id, status, booking_source, check_in, check_out, guest_count, with_breakfast, posted_room_rate, total_amount, downpayment_required, mode_of_payment, created_by, created_at)
  values ('d6000000-0000-4000-8000-000000000002', hotel, 'd4000000-0000-4000-8000-000000000202', 'd5000000-0000-4000-8000-000000000002', 'checked_in', 'walk_in', today - 1, today + 1, 2, false, 2250, 4500, 2250, 'cash', desk_id, now() - interval '2 days');
  -- Departure today (checked in two days ago)
  insert into public.reservations (id, hotel_id, room_id, guest_id, status, booking_source, check_in, check_out, guest_count, with_breakfast, posted_room_rate, total_amount, downpayment_required, mode_of_payment, created_by, created_at)
  values ('d6000000-0000-4000-8000-000000000003', hotel, 'd4000000-0000-4000-8000-000000000301', 'd5000000-0000-4000-8000-000000000003', 'checked_in', 'walk_in', today - 2, today, 3, false, 3500, 7000, 3500, 'cash', desk_id, now() - interval '3 days');
  -- Online booking with a payment proof waiting for a manager
  insert into public.reservations (id, hotel_id, room_id, guest_id, status, booking_source, check_in, check_out, guest_count, with_breakfast, posted_room_rate, total_amount, downpayment_required, mode_of_payment, created_at)
  values ('d6000000-0000-4000-8000-000000000004', hotel, 'd4000000-0000-4000-8000-000000000204', 'd5000000-0000-4000-8000-000000000004', 'payment_submitted', 'online', today + 3, today + 5, 2, true, 2250, 5500, 2750, 'bank_transfer', now() - interval '3 hours');
  -- Resort stay next week
  insert into public.reservations (id, hotel_id, room_id, guest_id, status, booking_source, check_in, check_out, guest_count, with_breakfast, posted_room_rate, total_amount, downpayment_required, mode_of_payment, created_by, created_at)
  values ('d6000000-0000-4000-8000-000000000005', resort, 'd4000000-0000-4000-8000-000000000101', 'd5000000-0000-4000-8000-000000000005', 'tentative', 'walk_in', today + 7, today + 9, 2, false, 3000, 6000, 3000, 'cash', owner_id, now() - interval '1 day');

  -- Payments: confirmed down payments, plus one submitted proof
  insert into public.payments (id, reservation_id, amount, method, payer_name, payment_reference, payment_details, proof_path, proof_original_name, status, paid_at, confirmed_at, confirmed_by, received_on) values
    ('d7000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 2750, 'gcash', 'TEST- Ada Arrival', 'TEST-GC-0001', 'TEST- GCash down payment', 'demo/test-proof-ada.svg', 'test-proof-ada.svg', 'confirmed', now() - interval '5 days', now() - interval '5 days', manager_id, today - 5),
    ('d7000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002', 2250, 'cash', 'TEST- Ben In-House', null, 'TEST- cash at check-in', 'demo/none', null, 'confirmed', now() - interval '1 day', now() - interval '1 day', manager_id, today - 1),
    ('d7000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000003', 3500, 'cash', 'TEST- Cora Departure', null, 'TEST- cash at check-in', 'demo/none', null, 'confirmed', now() - interval '2 days', now() - interval '2 days', manager_id, today - 2),
    ('d7000000-0000-4000-8000-000000000004', 'd6000000-0000-4000-8000-000000000004', 2750, 'bank_transfer', 'TEST- Dan Online', 'TEST-BANK-7781', 'TEST- bank transfer from TEST- Dan Online, reference TEST-BANK-7781', 'demo/test-proof-dan.svg', 'test-proof-dan.svg', 'submitted', now() - interval '3 hours', null, null, null);

  -- Ledger: two days ago, yesterday (the closed day) and today so far
  insert into public.ledger_entries (hotel_id, reservation_id, entry_date, category, description, amount, payment_method, is_collectible, created_by) values
    (hotel, 'd6000000-0000-4000-8000-000000000003', today - 2, 'room_payment', 'TEST- Cora Departure down payment', 3500, 'cash', false, desk_id),
    (hotel, 'd6000000-0000-4000-8000-000000000002', today - 1, 'room_payment', 'TEST- Ben In-House down payment', 2250, 'cash', false, desk_id),
    (hotel, 'd6000000-0000-4000-8000-000000000003', today - 1, 'room_payment', 'TEST- Cora Departure balance', 2250, 'cash', false, desk_id),
    (hotel, 'd6000000-0000-4000-8000-000000000003', today - 1, 'breakfast', 'TEST- breakfast for 2', 1000, 'gcash', false, desk_id),
    (hotel, 'd6000000-0000-4000-8000-000000000002', today, 'room_payment', 'TEST- Ben In-House balance', 2250, 'cash', false, desk_id);
  insert into public.ledger_entries (hotel_id, outlet_id, entry_date, category, description, amount, payment_method, is_collectible, created_by) values
    (hotel, cafe, today, 'misc', 'TEST- café walk-in sales', 1850, 'cash', false, 'd1000000-0000-4000-8000-000000000005');

  -- Completed (locked) day close for yesterday: 4,500 cash + 1,000 GCash, balanced
  insert into public.day_closes (id, hotel_id, outlet_id, business_date, responsible_profile_id, rvf_float, float_counted, drawer_counted, bank_deposit, return_to_fund, variance_amount, variance_status, variance_note, status, prepared_by, locked_by, locked_at, created_at)
  values (close_id, hotel, null, today - 1, desk_id, 10000, 10000, 4500, 0, 0, 0, 'balanced', 'TEST- balanced, counted by front desk', 'locked', desk_id, manager_id, now() - interval '10 hours', now() - interval '11 hours');
  insert into public.day_close_counts (day_close_id, bucket, denomination, quantity) values
    (close_id, 'float', 1000, 10), (close_id, 'drawer', 1000, 4), (close_id, 'drawer', 500, 1);

  -- Pending price change (rate override) request from the front desk
  insert into public.rate_override_requests (id, hotel_id, reservation_id, room_type_id, channel, requested_rate, reason, status, requested_by, created_at)
  values ('d8000000-0000-4000-8000-000000000001', hotel, 'd6000000-0000-4000-8000-000000000001', deluxe, 'walk_in', 2000, 'TEST- returning guest asked for the repeat-guest rate', 'pending', desk_id, now() - interval '1 hour');

  -- Pending late check-out request for the departing guest
  insert into public.stay_time_requests (id, hotel_id, reservation_id, kind, hours, hourly_rate, reason, status, requested_by, created_at)
  values ('d8000000-0000-4000-8000-000000000002', hotel, 'd6000000-0000-4000-8000-000000000003', 'late_check_out', 2, 200, 'TEST- flight is in the evening', 'pending', desk_id, now() - interval '30 minutes');
end $$;
