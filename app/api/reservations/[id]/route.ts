import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendHouseRulesEmail } from '@/lib/email';
import type { Guest, Hotel, Reservation } from '@/types/app';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  const { id } = await params;
  const payload = await request.json();

  const { data: currentRaw, error: currentError } = await supabaseAdmin
    .from('reservations')
    .select('*, hotels(*), guests(*)')
    .eq('id', id)
    .single();
  if (currentError || !currentRaw) return jsonError('Reservation not found.', 404);
  if (!canAccessHotel(staff.profile, currentRaw.hotel_id)) return jsonError('Hotel access denied.', 403);

  const update: Record<string, unknown> = {};
  for (const key of ['status', 'booking_source', 'check_in', 'check_out', 'guest_count', 'with_breakfast', 'posted_room_rate', 'surcharge_label', 'surcharge_amount', 'total_amount', 'downpayment_required', 'mode_of_payment', 'confirmed_by_name', 'notes']) {
    if (key in payload) update[key] = payload[key];
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

  const { data: hydratedRaw } = await supabaseAdmin
    .from('reservations')
    .select('*, hotels(*), guests(*)')
    .eq('id', id)
    .single();

  if (hydratedRaw?.guests?.email && !hydratedRaw.house_rules_sent_at) {
    await sendHouseRulesEmail({
      hotel: hydratedRaw.hotels as Hotel,
      guest: hydratedRaw.guests as Guest,
      reservation: hydratedRaw as Reservation
    });
  }

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: currentRaw.hotel_id,
    reservation_id: id,
    actor_id: staff.userId,
    action: 'reservation.updated',
    details: update
  });

  return NextResponse.json({ reservation: reservationRaw });
}
