import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { AUTO_BREAKFAST_REMOVED_ACTION, AUTO_POST_SOURCE, BREAKFAST_TURN_OFF_BLOCKED, autoChargeRemovedFromRead, breakfastTurnOffBlocked, isAutoPostedCharge, shouldPostAutoStayCharge } from '@/lib/breakfast-toggle';
import { priceStay } from '@/lib/hotel-pricing';
import { isRoomOverlapError, ROOM_JUST_TAKEN } from '@/lib/room-overlap';
import { billLaterMarkerChangeBlocked, billingReferenceAudit, billingReferenceEdit } from '@/lib/to-be-billed';
import { loadStayMoney } from '@/lib/stay-money';
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

  let referenceCorrection: { before: string; after: string } | null = null;
  if ('mode_of_payment' in payload && String(currentRaw.mode_of_payment || '').startsWith('to_be_billed:')) {
    const loaded = await loadStayMoney(id);
    if (!loaded.ok) return jsonError(loaded.error, 500);
    const owed = Math.round((loaded.money.total - loaded.money.confirmed) * 100) / 100;
    const edit = billingReferenceEdit(currentRaw.mode_of_payment, payload.mode_of_payment);
    if (billLaterMarkerChangeBlocked({
      currentMode: currentRaw.mode_of_payment,
      nextMode: payload.mode_of_payment,
      amountOwed: owed
    })) {
      return jsonError('This stay is still to be billed. The billing marker cannot be removed while money is owed. You can correct the invoice or PO reference.', 409);
    }
    if (edit.kind === 'reference') {
      payload.mode_of_payment = edit.mode;
      referenceCorrection = { before: edit.before, after: edit.after };
    }
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
    const { data: stayCharges, error: breakfastError } = await supabaseAdmin
      .from('reservation_charges')
      .select('id, category, notes')
      .eq('reservation_id', id);
    if (breakfastError) {
      console.error(breakfastError);
      return jsonError('Could not check the breakfast charge. Try again.', 500);
    }
    const autoPosted = (stayCharges || []).some((charge) => isAutoPostedCharge(charge));
    if (breakfastTurnOffBlocked(Boolean(currentRaw.with_breakfast), payload.with_breakfast, autoPosted)) {
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

  if (reservationRaw.status === 'checked_in') {
    const [existingCharges, removedBreakfast, hotelRow, roomRow] = await Promise.all([
      supabaseAdmin.from('reservation_charges').select('id, category, notes').eq('reservation_id', id),
      supabaseAdmin.from('audit_logs').select('id').eq('reservation_id', id).eq('action', AUTO_BREAKFAST_REMOVED_ACTION).limit(1),
      supabaseAdmin.from('hotels').select('slug').eq('id', currentRaw.hotel_id).maybeSingle(),
      supabaseAdmin.from('rooms').select('room_type_name').eq('id', reservationRaw.room_id).maybeSingle()
    ]);
    if (removedBreakfast.error) {
      console.error(removedBreakfast.error);
      const checkingIn = currentRaw.status !== 'checked_in';
      if (checkingIn) {
        const reverted = await supabaseAdmin.from('reservations').update({ status: currentRaw.status }).eq('id', id);
        if (reverted.error) console.error(reverted.error);
        return jsonError(reverted.error
          ? 'Check-in was saved, but the extra bed was not posted because the removal record could not be read. Try again.'
          : 'Check-in could not confirm whether the extra bed was already removed. Check-in was not saved. Try again.', reverted.error ? 500 : 503);
      }
    } else if (existingCharges.error || hotelRow.error || roomRow.error) {
      console.error(existingCharges.error || hotelRow.error || roomRow.error);
    } else {
      const price = priceStay({
        hotelSlug: hotelRow.data?.slug,
        roomTypeName: roomRow.data?.room_type_name,
        nightlyRate: Number(reservationRaw.posted_room_rate || 0),
        nights: Number(reservationRaw.nights || 1),
        guestCount: Number(reservationRaw.guest_count || 1),
        withBreakfast: Boolean(reservationRaw.with_breakfast),
        rateAlreadyAdjusted: true
      });
      if (shouldPostAutoStayCharge({
        status: reservationRaw.status,
        extraBedTotal: price.extraBedTotal,
        charges: existingCharges.data || [],
        removed: autoChargeRemovedFromRead(removedBreakfast.error, removedBreakfast.data)
      })) {
      const charge = {
        reservation_id: id,
        hotel_id: currentRaw.hotel_id,
        service_item_id: null,
        description: price.extraBedLine,
        category: 'extra_bed',
        quantity: price.extraPax * price.nights,
        unit_price: price.extraBedRate,
        total_amount: price.extraBedTotal,
        remittance_required: false,
        remittance_note: null,
        notes: AUTO_POST_SOURCE,
        created_by: staff.userId
      };
      const inserted = await supabaseAdmin.from('reservation_charges').insert(charge).select('id').single();
      if (inserted.error && String(inserted.error.message || '').includes('total_amount')) {
        const { total_amount: _ignored, ...withoutTotal } = charge;
        await supabaseAdmin.from('reservation_charges').insert(withoutTotal);
      }
      }
    }
  }

  if (referenceCorrection) {
    const { error: referenceError } = await supabaseAdmin.from('audit_logs').insert(billingReferenceAudit({
      hotelId: currentRaw.hotel_id,
      reservationId: id,
      actorId: staff.userId,
      before: referenceCorrection.before,
      after: referenceCorrection.after,
      when: new Date().toISOString()
    }));
    if (referenceError) {
      console.error(referenceError);
      await supabaseAdmin.from('reservations').update({ mode_of_payment: currentRaw.mode_of_payment }).eq('id', id);
      return jsonError('The invoice or PO correction could not be recorded. The reference was not changed.', 500);
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
