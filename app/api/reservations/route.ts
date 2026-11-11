import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { businessToday } from '@/lib/date';
import { calculateDownpayment } from '@/lib/downpayment';
import { confirmedPaymentLedgerRow } from '@/lib/confirmed-payment-ledger';
import { canApproveCompanyBillLater, canCreateToBeBilledStay, decideCompanyBillLater, guestCountAllowed, quotePublicStay, staffBookingPayment } from '@/lib/public-quote';
import { undoStayPieces } from '@/lib/undo-stay';
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
    supabaseAdmin.from('hotels').select('slug, timezone, downpayment_type, default_downpayment_percent, default_downpayment_amount').eq('id', hotelId).maybeSingle(),
    supabaseAdmin.from('rooms').select('base_rate, room_type_name, hotel_id, capacity').eq('id', roomId).maybeSingle()
  ]);
  if (!hotelRaw || !roomRaw || roomRaw.hotel_id !== hotelId) return jsonError('Room not found for this hotel.', 404);
  const guestCount = Math.max(1, Math.floor(Number(payload.guest_count || 1)));
  const roomCapacity = Math.floor(Number(roomRaw.capacity || 0));
  if (roomCapacity >= 1 && !guestCountAllowed(guestCount, roomCapacity)) {
    return jsonError(`This room allows up to ${roomCapacity} guests.`);
  }
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
  const bookingSource = String(payload.booking_source || 'walk_in');
  const paid = staffBookingPayment({
    bookingSource,
    amount: Number(payload.desk_payment || payload.payment_amount || 0),
    downpaymentRequired: downpayment,
    stayTotal,
    paymentKind: String(payload.payment_kind || (bookingSource === 'walk_in' ? 'desk_cash' : '')),
    reference: String(payload.payment_reference || ''),
    otaName: String(payload.ota_name || ''),
    canConfirm: staff.profile.role === 'owner' || staff.profile.role === 'manager',
    role: staff.profile.role,
    billCompanyLater: payload.bill_company_later === true || payload.bill_company_later === 'true'
  });
  if (!paid.ok) return jsonError(paid.error);
  if (paid.companyBillLater && !canApproveCompanyBillLater(staff.profile.role)) {
    return jsonError('Front desk cannot skip the deposit on a company stay.', 403);
  }
  if (paid.modeOfPayment && !paid.companyBillLater && !canCreateToBeBilledStay(staff.profile.role)) {
    return jsonError('Front desk can save an LGU stay to be billed.', 403);
  }

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
      status: paid.reservationStatus,
      booking_source: bookingSource,
      check_in: checkIn,
      check_out: checkOut,
      guest_count: guestCount,
      with_breakfast: quote.withBreakfast,
      posted_room_rate: quote.nightlyRate,
      surcharge_label: payload.surcharge_label || null,
      surcharge_amount: surcharge,
      total_amount: Math.round((quote.roomTotal + surcharge) * 100) / 100,
      downpayment_required: paid.modeOfPayment ? 0 : downpayment,
      mode_of_payment: paid.modeOfPayment,
      notes: payload.notes || null,
      created_by: staff.userId
    })
    .select('*')
    .single();

  if (reservationError || !reservationRaw) {
    const undone = await undoStayPieces({ guestId: guestRaw.id });
    const reason = reservationError?.message || 'Failed to create reservation.';
    return jsonError(undone.roomHeld ? undone.message : `${reason} ${undone.message}`, 500);
  }

  const paymentAmount = Number(payload.desk_payment || payload.payment_amount || 0);
  let paymentId: string | null = null;
  if (paid.recordPayment) {
    const { data: paymentRaw, error: paymentError } = await supabaseAdmin.from('payments').insert({
      reservation_id: reservationRaw.id,
      amount: paymentAmount,
      method: paid.method,
      payer_name: guestName,
      payment_reference: paid.reference || null,
      payment_details: paid.details,
      proof_path: paid.proofPath,
      status: paid.paymentStatus,
      confirmed_at: paid.paymentStatus === 'confirmed' ? new Date().toISOString() : null,
      confirmed_by: paid.paymentStatus === 'confirmed' ? staff.userId : null,
      received_on: paid.paymentStatus === 'confirmed' ? businessToday(hotelRaw.timezone) : null
    }).select('id').single();
    if (paymentError || !paymentRaw) {
      console.error(paymentError);
      const undone = await undoStayPieces({ reservationId: reservationRaw.id, guestId: guestRaw.id });
      return jsonError(undone.roomHeld ? undone.message : `The payment could not be saved. ${undone.message}`, 500);
    }
    paymentId = paymentRaw.id;
  }

  if (paid.writeLedger && paymentId) {
    const ledger = confirmedPaymentLedgerRow({
      hotelId,
      reservationId: reservationRaw.id,
      paymentId,
      amount: paymentAmount,
      method: paid.method,
      guestName,
      entryDate: businessToday(hotelRaw.timezone),
      actorId: staff.userId
    });
    const inserted = await supabaseAdmin.from('ledger_entries').insert(ledger).select('id').single();
    if (inserted.error || !inserted.data) {
      console.error(inserted.error);
      const undone = await undoStayPieces({
        paymentId,
        reservationId: reservationRaw.id,
        guestId: guestRaw.id
      });
      return jsonError(undone.roomHeld ? undone.message : `The payment could not be recorded in the day book. ${undone.message}`, 500);
    }
  }

  await recordProcessedOfflineRequest({
    clientRequestId,
    requestType: 'reservation.create',
    serverTable: 'reservations',
    serverId: reservationRaw.id,
    createdBy: staff.userId
  });

  if (paid.companyBillLater) {
    const approved = decideCompanyBillLater({
      role: staff.profile.role,
      bookingSource,
      reference: paid.reference,
      actorId: staff.userId,
      hotelId,
      reservationId: reservationRaw.id,
      when: new Date().toISOString()
    });
    if (!approved.ok) {
      const undone = await undoStayPieces({ reservationId: reservationRaw.id, guestId: guestRaw.id });
      return jsonError(undone.roomHeld ? undone.message : `${approved.error} ${undone.message}`, approved.status);
    }
    const { error: approvalError } = await supabaseAdmin.from('audit_logs').insert(approved.audit);
    if (approvalError) {
      console.error(approvalError);
      const undone = await undoStayPieces({ reservationId: reservationRaw.id, guestId: guestRaw.id });
      return jsonError(undone.roomHeld ? undone.message : `The approval could not be recorded. ${undone.message}`, 500);
    }
  }

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    reservation_id: reservationRaw.id,
    actor_id: staff.userId,
    action: 'reservation.created',
    details: { status: paid.reservationStatus, method: paid.method, reference: paid.reference, amount: paid.recordPayment ? paymentAmount : 0, mode_of_payment: paid.modeOfPayment }
  });

  return NextResponse.json({ reservation: reservationRaw });
}
