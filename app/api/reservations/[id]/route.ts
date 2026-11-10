import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { breakfastBill } from '@/lib/breakfast-charge';
import { BREAKFAST_TURN_OFF_BLOCKED, breakfastTurnOffBlocked } from '@/lib/breakfast-toggle';
import { isRoomOverlapError, ROOM_JUST_TAKEN } from '@/lib/room-overlap';
import { decideReservationUpdate, RESERVATION_MONEY_FIELDS, type MoneyField, type PolicyStatus } from '@/lib/reservation-policy';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'daily');
  if (denied) return denied;
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

  const frontline = staff.profile.role === 'front_desk' || staff.profile.role === 'cashier' || staff.profile.role === 'restaurant_staff';
  if (frontline) {
    const blocked = ['booking_source', 'check_in', 'check_out', 'guest_count', 'with_breakfast', 'surcharge_label', 'surcharge_amount', 'mode_of_payment', 'confirmed_by_name', 'notes', 'room_id', 'guest_id', 'posted_room_rate', 'total_amount', 'downpayment_required', 'guest_name', 'guest_email', 'guest_phone'];
    if (blocked.some((key) => key in payload)) return jsonError('Front desk can only check a guest in or out.', 403);
  }

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

  if ('with_breakfast' in payload) {
    const { data: breakfastCharges, error: breakfastError } = await supabaseAdmin
      .from('reservation_charges')
      .select('id')
      .eq('reservation_id', id)
      .eq('category', 'breakfast')
      .limit(1);
    if (breakfastError) {
      console.error(breakfastError);
      return jsonError('Could not check the breakfast charge. Try again.', 500);
    }
    if (breakfastTurnOffBlocked(Boolean(currentRaw.with_breakfast), payload.with_breakfast, Boolean(breakfastCharges?.length))) {
      return jsonError(BREAKFAST_TURN_OFF_BLOCKED);
    }
  }

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
  if (updateError || !reservationRaw) {
    if (isRoomOverlapError(updateError)) {
      console.error(updateError);
      return jsonError(ROOM_JUST_TAKEN);
    }
    return jsonError(updateError?.message || 'Failed to update reservation.');
  }

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

  if (reservationRaw.status === 'checked_in' && reservationRaw.with_breakfast) {
    const { data: existingBreakfast } = await supabaseAdmin
      .from('reservation_charges')
      .select('id')
      .eq('reservation_id', id)
      .eq('category', 'breakfast')
      .limit(1);
    if (!existingBreakfast?.length) {
      const { data: hotel } = await supabaseAdmin
        .from('hotels')
        .select('breakfast_rate_per_room, breakfast_outlet_portion_per_head')
        .eq('id', currentRaw.hotel_id)
        .maybeSingle();
      const bill = breakfastBill({
        nights: Number(reservationRaw.nights || 1),
        guestCount: Number(reservationRaw.guest_count || 1),
        ratePerRoom: Number(hotel?.breakfast_rate_per_room ?? 500),
        outletPerHead: Number(hotel?.breakfast_outlet_portion_per_head ?? 250)
      });
      const { data: service } = await supabaseAdmin
        .from('service_items')
        .select('id')
        .eq('hotel_id', currentRaw.hotel_id)
        .eq('category', 'breakfast')
        .ilike('name', 'Breakfast')
        .maybeSingle();
      const charge = {
        reservation_id: id,
        hotel_id: currentRaw.hotel_id,
        service_item_id: service?.id || null,
        description: `Breakfast ${bill.nights} night(s) at ${bill.guestTotal / bill.nights} per room`,
        category: 'breakfast',
        quantity: bill.nights,
        unit_price: bill.guestTotal / bill.nights,
        total_amount: bill.guestTotal,
        remittance_required: true,
        remittance_note: `Outlet owed ${bill.outletOwed} (${bill.heads} head(s) x ${bill.nights} night(s))`,
        notes: 'Posted at check-in from the breakfast settings.',
        created_by: staff.userId
      };
      const inserted = await supabaseAdmin.from('reservation_charges').insert(charge).select('id').single();
      if (inserted.error && String(inserted.error.message || '').includes('total_amount')) {
        const { total_amount: _ignored, ...withoutTotal } = charge;
        await supabaseAdmin.from('reservation_charges').insert(withoutTotal);
      }
    }
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
