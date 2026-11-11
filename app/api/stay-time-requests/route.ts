import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { hourlyCharge } from '@/lib/stay-hours';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'daily');
  if (denied) return denied;
  const payload = await request.json();
  const reservationId = String(payload.reservation_id || '');
  const kind = String(payload.kind || '');
  const hours = Number(payload.hours);
  const reason = String(payload.reason || '').trim();
  if (kind !== 'early_check_in' && kind !== 'late_check_out') return jsonError('Choose early check-in or late check-out.');
  if (!Number.isFinite(hours) || hours <= 0) return jsonError('Enter the number of hours.');
  if (!reason) return jsonError('A reason is required.');

  const { data: reservation, error } = await supabaseAdmin
    .from('reservations')
    .select('id, hotel_id, hotels(early_checkin_hourly_rate, late_checkout_hourly_rate)')
    .eq('id', reservationId)
    .single();
  if (error || !reservation) return jsonError('Reservation not found.', 404);
  if (!canAccessHotel(auth.staff.profile, reservation.hotel_id)) return jsonError('Hotel access denied.', 403);

  const hotelJoin = reservation.hotels as { early_checkin_hourly_rate?: number; late_checkout_hourly_rate?: number } | { early_checkin_hourly_rate?: number; late_checkout_hourly_rate?: number }[] | null;
  const hotel = Array.isArray(hotelJoin) ? hotelJoin[0] : hotelJoin;
  const hourlyRate = kind === 'early_check_in' ? Number(hotel?.early_checkin_hourly_rate ?? 200) : Number(hotel?.late_checkout_hourly_rate ?? 200);

  const { data, error: insertError } = await supabaseAdmin
    .from('stay_time_requests')
    .insert({
      hotel_id: reservation.hotel_id,
      reservation_id: reservationId,
      kind,
      hours,
      hourly_rate: hourlyRate,
      reason,
      requested_by: auth.staff.userId
    })
    .select('*')
    .single();
  if (insertError || !data) return jsonError(insertError?.message || 'Failed to request the charge.', 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: reservation.hotel_id,
    reservation_id: reservationId,
    actor_id: auth.staff.userId,
    action: 'stay_time.requested',
    details: { request_id: data.id, kind, hours, hourly_rate: hourlyRate, amount: hourlyCharge(hours, hourlyRate), reason }
  });
  return NextResponse.json({ request: data });
}
