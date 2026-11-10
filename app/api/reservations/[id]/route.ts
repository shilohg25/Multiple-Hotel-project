import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { decideReservationUpdate, RESERVATION_MONEY_FIELDS, type MoneyField, type PolicyStatus } from '@/lib/reservation-policy';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  const { id } = await params;
  const payload = await request.json();

  const { data: currentRaw, error: currentError } = await supabaseAdmin
    .from('reservations')
    .select('*, guests(*)')
    .eq('id', id)
    .single();
  if (currentError || !currentRaw) return jsonError('Reservation not found.', 404);
  if (!canAccessHotel(staff.profile, currentRaw.hotel_id)) return jsonError('Hotel access denied.', 403);

  const update: Record<string, unknown> = {};
  for (const key of ['booking_source', 'check_in', 'check_out', 'guest_count', 'with_breakfast', 'surcharge_label', 'surcharge_amount', 'mode_of_payment', 'confirmed_by_name', 'notes']) {
    if (key in payload) update[key] = payload[key];
  }

  const nextMoney: Partial<Record<MoneyField, number>> = {};
  for (const field of RESERVATION_MONEY_FIELDS) {
    if (field in payload) nextMoney[field] = Number(payload[field]);
  }

  const decision = decideReservationUpdate({
    role: staff.profile.role,
    currentStatus: currentRaw.status as PolicyStatus,
    currentMoney: {
      posted_room_rate: Number(currentRaw.posted_room_rate || 0),
      total_amount: Number(currentRaw.total_amount || 0),
      downpayment_required: Number(currentRaw.downpayment_required || 0)
    },
    nextStatus: 'status' in payload ? (payload.status as PolicyStatus) : undefined,
    nextMoney,
    reason: payload.reason
  });
  if (!decision.ok) return jsonError(decision.error, decision.status);

  if ('status' in payload) update.status = payload.status;
  for (const field of RESERVATION_MONEY_FIELDS) {
    if (field in nextMoney) update[field] = nextMoney[field];
  }

  const { data: reservationRaw, error: updateError } = await supabaseAdmin
    .from('reservations')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (updateError || !reservationRaw) return jsonError(updateError?.message || 'Failed to update reservation.');

  if ('guest_email' in payload || 'guest_name' in payload || 'guest_phone' in payload) {
    await supabaseAdmin
      .from('guests')
      .update({
        full_name: payload.guest_name || currentRaw.guests.full_name,
        email: payload.guest_email || currentRaw.guests.email,
        phone: payload.guest_phone || currentRaw.guests.phone
      })
      .eq('id', currentRaw.guest_id);
  }

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: currentRaw.hotel_id,
    reservation_id: id,
    actor_id: staff.userId,
    action: 'reservation.updated',
    details: {
      reason: String(payload.reason || '').trim() || null,
      before: Object.fromEntries(decision.changes.map((change) => [change.field, change.before])),
      after: Object.fromEntries(decision.changes.map((change) => [change.field, change.after])),
      changes: decision.changes,
      update
    }
  });

  return NextResponse.json({ reservation: reservationRaw });
}
