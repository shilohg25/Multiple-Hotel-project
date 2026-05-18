import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hasReservationConflict } from '@/lib/availability';
import { getProcessedOfflineRequest, recordProcessedOfflineRequest } from '@/lib/idempotency';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
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
  if (conflict) return jsonError('This room already has a secured booking for the selected dates. Tentative reservations can overlap, but secured bookings cannot.');

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
      status: 'tentative',
      booking_source: payload.booking_source || 'walk_in',
      check_in: checkIn,
      check_out: checkOut,
      guest_count: Number(payload.guest_count || 1),
      with_breakfast: String(payload.with_breakfast) === 'true',
      posted_room_rate: Number(payload.posted_room_rate || 0),
      surcharge_label: payload.surcharge_label || null,
      surcharge_amount: Number(payload.surcharge_amount || 0),
      total_amount: Number(payload.total_amount || 0),
      downpayment_required: Number(payload.downpayment_required || 0),
      notes: payload.notes || null,
      created_by: staff.userId
    })
    .select('*')
    .single();

  if (reservationError || !reservationRaw) return jsonError(reservationError?.message || 'Failed to create reservation.');

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
    details: { status: 'tentative' }
  });

  return NextResponse.json({ reservation: reservationRaw });
}
