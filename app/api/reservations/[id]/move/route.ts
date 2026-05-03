import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hasReservationConflict } from '@/lib/availability';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  const { id } = await params;
  const payload = await request.json();

  const roomId = String(payload.room_id || '');
  const checkIn = String(payload.check_in || '');
  const checkOut = String(payload.check_out || '');
  if (!roomId || !checkIn || !checkOut || checkOut <= checkIn) return jsonError('Valid room and dates are required.');

  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', id)
    .single();
  if (reservationError || !reservation) return jsonError('Reservation not found.', 404);
  if (!canAccessHotel(staff.profile, reservation.hotel_id)) return jsonError('Hotel access denied.', 403);

  const { data: room, error: roomError } = await supabaseAdmin.from('rooms').select('*').eq('id', roomId).single();
  if (roomError || !room || room.hotel_id !== reservation.hotel_id) return jsonError('Room not found for this hotel.', 404);

  const conflict = await hasReservationConflict({ roomId, checkIn, checkOut, ignoreReservationId: id });
  if (conflict) return jsonError('Move blocked: the new room/date range overlaps a secured booking.');

  const { data, error: updateError } = await supabaseAdmin
    .from('reservations')
    .update({ room_id: roomId, check_in: checkIn, check_out: checkOut })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) return jsonError(updateError.message, 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: reservation.hotel_id,
    reservation_id: id,
    actor_id: staff.userId,
    action: 'reservation.moved',
    details: { room_id: roomId, check_in: checkIn, check_out: checkOut }
  });

  return NextResponse.json({ reservation: data });
}
