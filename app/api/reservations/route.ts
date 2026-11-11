import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { calculateDownpayment } from '@/lib/downpayment';
import { quotePublicStay, walkInDeskStay } from '@/lib/public-quote';
import { ROOM_JUST_TAKEN } from '@/lib/room-overlap';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hasReservationConflict } from '@/lib/availability';
import { getProcessedOfflineRequest, recordProcessedOfflineRequest } from '@/lib/idempotency';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'daily');
  if (denied) return denied;
  const staff = auth.staff;

  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const roomId = String(payload.room_id || '');
  const guestName = String(payload.guest_name || '').trim();
  const checkIn = String(payload.check_in || '');
  const checkOut = String(payload.check_out || '');
  const clientRequestId = String(payload.client_request_id || payload.offline_id || '').trim() || null;

  const processed = await getProcessedOfflineRequest(clientRequestId, 'reservation.create');
  if (processed?.server_id) {
    return NextResponse.json({ reservation: { id: processed.server_id }, duplicate: true });
  }

  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!roomId) return jsonError('Room is required.');
  if (!guestName) return jsonError('Guest name is required.');
  if (!checkIn || !checkOut || checkOut <= checkIn) return jsonError('Valid check-in and check-out dates are required.');

  const conflict = await hasReservationConflict({ roomId, checkIn, checkOut });
  if (conflict) return jsonError(ROOM_JUST_TAKEN);

  const [{ data: hotelRaw }, { data: roomRaw }] = await Promise.all([
    supabaseAdmin.from('hotels').select('slug, downpayment_type, default_downpayment_percent, default_downpayment_amount').eq('id', hotelId).maybeSingle(),
    supabaseAdmin.from('rooms').select('base_rate, room_type_name, hotel_id').eq('id', roomId).maybeSingle()
  ]);
  if (!hotelRaw || !roomRaw || roomRaw.hotel_id !== hotelId) return jsonError('Room not found for this hotel.', 404);
  const guestCount = Math.max(1, Math.floor(Number(payload.guest_count || 1)));
  const surcharge = Math.max(0, Number(payload.surcharge_amount || 0));
  const quote = quotePublicStay({
    hotelSlug: hotelRaw.slug,
    roomTypeName: roomRaw.room_type_name,
    nightlyRate: Number(roomRaw.base_rate || 0),
    checkIn,
    checkOut,
    guestCount,
    withBreakfast: String(payload.with_breakfast) === 'true',
    downpaymentType: hotelRaw.downpayment_type,
    defaultPercent: Number(hotelRaw.default_downpayment_percent || 0),
    defaultAmount: Number(hotelRaw.default_downpayment_amount || 0)
  });
  const stayTotal = quote.total + surcharge;
  const downpayment = quote.fixedDownpaymentPercent != null
    ? Math.round(stayTotal * quote.fixedDownpaymentPercent) / 100
    : calculateDownpayment({
      hotel: hotelRaw,
      total: stayTotal,
      nightlyRate: quote.nightlyRate,
      manualAmount: Number(payload.manual_downpayment_amount || payload.downpayment_required || 0)
    });
  const desk = walkInDeskStay({
    bookingSource: String(payload.booking_source || 'walk_in'),
    deskPayment: Number(payload.desk_payment || 0),
    downpaymentRequired: downpayment
  });
  if (!desk.ok) return jsonError(desk.error);
  const deskPayment = Number(payload.desk_payment || 0);

  const { data: guestRaw, error: guestError } = await supabaseAdmin
    .from('guests')
    .insert({
      full_name: guestName,
      email: payload.guest_email || null,
      phone: payload.guest_phone || null
    })
    .select('*')
    .single();
  if (guestError || !guestRaw) return jsonError(guestError?.message || 'Failed to create guest.');

  const { data: reservationRaw, error: reservationError } = await supabaseAdmin
    .from('reservations')
    .insert({
      hotel_id: hotelId,
      room_id: roomId,
      guest_id: guestRaw.id,
      status: desk.status,
      booking_source: 'walk_in',
      check_in: checkIn,
      check_out: checkOut,
      guest_count: guestCount,
      with_breakfast: quote.withBreakfast,
      posted_room_rate: quote.nightlyRate,
      surcharge_label: payload.surcharge_label || null,
      surcharge_amount: surcharge,
      total_amount: Math.round((quote.roomTotal + surcharge) * 100) / 100,
      downpayment_required: downpayment,
      notes: payload.notes || null,
      created_by: staff.userId
    })
    .select('*')
    .single();

  if (reservationError || !reservationRaw) {
    await supabaseAdmin.from('guests').delete().eq('id', guestRaw.id);
    return jsonError(reservationError?.message || 'Failed to create reservation.');
  }

  const { error: paymentError } = await supabaseAdmin.from('payments').insert({
    reservation_id: reservationRaw.id,
    amount: deskPayment,
    method: 'cash',
    payer_name: guestName,
    payment_details: 'Paid at the desk',
    proof_path: 'walk-in/desk-cash',
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    confirmed_by: staff.userId
  });
  if (paymentError) {
    console.error(paymentError);
    await supabaseAdmin.from('reservations').delete().eq('id', reservationRaw.id);
    await supabaseAdmin.from('guests').delete().eq('id', guestRaw.id);
    return jsonError('The desk payment could not be saved, so the room was not held.', 500);
  }

  await recordProcessedOfflineRequest({
    clientRequestId,
    requestType: 'reservation.create',
    serverTable: 'reservations',
    serverId: reservationRaw.id,
    createdBy: staff.userId
  });

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    reservation_id: reservationRaw.id,
    actor_id: staff.userId,
    action: 'reservation.created',
    details: { status: desk.status, desk_payment: deskPayment }
  });

  return NextResponse.json({ reservation: reservationRaw });
}
