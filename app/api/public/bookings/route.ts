import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { hasReservationConflict } from '@/lib/availability';
import { businessToday } from '@/lib/date';
import { isValidGuestEmail, normalizePhMobile, proofFileProblem } from '@/lib/guest-contact';
import { allowPublicBooking, publicBookingClientIp } from '@/lib/public-booking-limit';
import { isRoomOverlapError, ROOM_JUST_TAKEN } from '@/lib/room-overlap';
import { paymentAccountForHotel } from '@/lib/payment-instructions';
import { MAX_PUBLIC_STAY_NIGHTS, guestCountAllowed, pastCheckInRefusal, paymentCoversDownpayment, paymentWithinStay, quotePublicStay } from '@/lib/public-quote';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { undoStayPieces } from '@/lib/undo-stay';

export const runtime = 'nodejs';

function cleanFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/-+/g, '-').slice(0, 100) || 'proof';
}

function guestFailure(message: string, detail?: unknown) {
  if (detail !== undefined) console.error(detail);
  return jsonError(message);
}

async function removeBooking(ids: { proofPath?: string; guestId?: string; reservationId?: string }) {
  return undoStayPieces(ids);
}

export async function POST(request: Request) {
  if (!allowPublicBooking(publicBookingClientIp(request))) {
    return jsonError('Too many booking attempts. Please wait a few minutes and try again.', 429);
  }
  const form = await request.formData();
  const hotelId = String(form.get('hotel_id') || '');
  const roomId = String(form.get('room_id') || '');
  const guestName = String(form.get('guest_name') || '').trim();
  const guestEmail = String(form.get('guest_email') || '').trim();
  const guestPhone = String(form.get('guest_phone') || '').trim();
  const paymentDetails = String(form.get('payment_details') || '').trim();
  const payerName = String(form.get('payer_name') || '').trim() || guestName;
  const paymentReference = String(form.get('payment_reference') || '').trim() || null;
  const checkIn = String(form.get('check_in') || '');
  const checkOut = String(form.get('check_out') || '');
  const proof = form.get('proof');
  const paymentAmount = Number(form.get('payment_amount') || 0);
  const guestCount = Math.floor(Number(form.get('guest_count') || 1));
  const withBreakfast = String(form.get('with_breakfast')) === 'true';
  const method = String(form.get('payment_method') || 'gcash') === 'bank_transfer' ? 'bank_transfer' : 'gcash';

  if (!guestName || !guestEmail || !guestPhone || !paymentDetails) {
    return guestFailure('Please fill in your name, email, phone, and payment details.');
  }
  if (!isValidGuestEmail(guestEmail)) return guestFailure('Enter a valid email address.');
  const phone = normalizePhMobile(guestPhone);
  if (!phone) return guestFailure('Enter a Philippine mobile number, such as 09XXXXXXXXX.');
  if (!hotelId || !roomId) return guestFailure('Choose a hotel and a room.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
    return guestFailure('Choose a check-in date and a later check-out date.');
  }
  if (!(proof instanceof File)) return guestFailure('Payment proof upload is required.');
  const fileProblem = proofFileProblem(proof);
  if (fileProblem) return guestFailure(fileProblem);

  const { data: hotelRaw, error: hotelError } = await supabaseAdmin.from('hotels').select('*').eq('id', hotelId).eq('active', true).single();
  if (hotelError || !hotelRaw) return guestFailure('That property is not available.', hotelError);
  const today = businessToday(hotelRaw.timezone);
  const pastCheckIn = pastCheckInRefusal(checkIn, today);
  if (pastCheckIn) return guestFailure(pastCheckIn);

  const { data: roomRaw, error: roomError } = await supabaseAdmin.from('rooms').select('*').eq('id', roomId).eq('hotel_id', hotelId).eq('active', true).single();
  if (roomError || !roomRaw) return guestFailure('That room is not available.', roomError);
  if (!guestCountAllowed(guestCount, Number(roomRaw.capacity || 0))) {
    return guestFailure(`This room allows up to ${roomRaw.capacity} guests.`);
  }

  let nightlyRate = Number(roomRaw.base_rate || 0);
  if (roomRaw.room_type_id) {
    const rateRow = await supabaseAdmin
      .from('room_type_channel_rates')
      .select('rate')
      .eq('room_type_id', roomRaw.room_type_id)
      .eq('channel', 'walk_in')
      .maybeSingle();
    if (rateRow.error) console.error(rateRow.error);
    else if (rateRow.data) nightlyRate = Number(rateRow.data.rate);
  }

  const payTo = paymentAccountForHotel(hotelRaw);
  if (method === 'gcash' && !payTo.gcash) return guestFailure('This property does not take GCash. Use a bank transfer.');
  const quote = quotePublicStay({
    hotelSlug: hotelRaw.slug,
    roomTypeName: roomRaw.room_type_name,
    nightlyRate,
    checkIn,
    checkOut,
    guestCount,
    withBreakfast,
    downpaymentType: hotelRaw.downpayment_type,
    defaultPercent: Number(hotelRaw.default_downpayment_percent || 0),
    defaultAmount: Number(hotelRaw.default_downpayment_amount || 0)
  });
  if (quote.nights < 1) return guestFailure('Choose a check-in date and a later check-out date.');
  if (quote.nights > MAX_PUBLIC_STAY_NIGHTS) return guestFailure('A stay can be at most 30 nights.');
  if (!paymentCoversDownpayment(paymentAmount, quote.downpaymentRequired)) {
    return guestFailure(`The payment must be at least the required down payment of ${quote.downpaymentRequired.toFixed(2)}.`);
  }
  if (!paymentWithinStay(paymentAmount, quote.total)) {
    return guestFailure('The payment cannot be more than the stay total.');
  }

  let conflict = false;
  try {
    conflict = await hasReservationConflict({ roomId, checkIn, checkOut });
  } catch (error) {
    return guestFailure('We could not check room availability. Please try again.', error);
  }
  if (conflict) return guestFailure('This room is already held for those dates. Please choose another room or date.');

  const reservationId = crypto.randomUUID();
  const proofPath = `${hotelId}/${reservationId}/${Date.now()}-${cleanFileName(proof.name)}`;
  const buffer = Buffer.from(await proof.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from('payment-proofs')
    .upload(proofPath, buffer, { contentType: proof.type || 'application/octet-stream', upsert: false });
  if (uploadError) return guestFailure('The payment proof could not be saved. Please try a JPG, PNG, or PDF under 4 MB.', uploadError);

  const { data: guestRaw, error: guestError } = await supabaseAdmin
    .from('guests')
    .insert({ full_name: guestName, email: guestEmail, phone })
    .select('*')
    .single();
  if (guestError || !guestRaw) {
    await removeBooking({ proofPath });
    return guestFailure('The booking could not be saved. The room is not held.', guestError);
  }

  const noteParts = [form.get('notes') ? String(form.get('notes')) : ''];
  if (quote.downpaymentDefaulted) noteParts.push('Down payment used the 50% default because this hotel is set to manual and has no amount configured.');
  const notes = noteParts.filter(Boolean).join('\n') || null;

  const { data: reservationRaw, error: reservationError } = await supabaseAdmin
    .from('reservations')
    .insert({
      id: reservationId,
      hotel_id: hotelId,
      room_id: roomId,
      guest_id: guestRaw.id,
      status: 'payment_submitted',
      booking_source: 'online',
      check_in: checkIn,
      check_out: checkOut,
      guest_count: guestCount,
      with_breakfast: quote.withBreakfast,
      posted_room_rate: quote.nightlyRate,
      surcharge_label: null,
      surcharge_amount: 0,
      total_amount: quote.roomTotal,
      downpayment_required: quote.downpaymentRequired,
      notes
    })
    .select('*')
    .single();
  if (reservationError || !reservationRaw) {
    const undone = await removeBooking({ proofPath, guestId: guestRaw.id });
    if (isRoomOverlapError(reservationError)) return guestFailure(undone.roomHeld ? undone.message : ROOM_JUST_TAKEN, reservationError);
    return guestFailure(undone.roomHeld ? undone.message : `The booking could not be saved. ${undone.message}`, reservationError);
  }

  const { error: paymentError } = await supabaseAdmin.from('payments').insert({
    reservation_id: reservationRaw.id,
    amount: paymentAmount,
    method,
    payer_name: payerName,
    payment_reference: paymentReference,
    payment_details: paymentDetails,
    proof_path: proofPath,
    proof_original_name: proof.name,
    status: 'submitted'
  });
  if (paymentError) {
    const undone = await removeBooking({ proofPath, guestId: guestRaw.id, reservationId });
    return guestFailure(undone.roomHeld ? undone.message : `The payment could not be saved. ${undone.message}`, paymentError);
  }

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    reservation_id: reservationRaw.id,
    action: 'public_booking.created',
    details: {
      payment_amount: paymentAmount,
      payment_method: method,
      downpayment_required: quote.downpaymentRequired,
      downpayment_defaulted: quote.downpaymentDefaulted,
      total: quote.total
    }
  });

  const reference = reservationRaw.id.slice(0, 8).toUpperCase();
  return NextResponse.json({
    reference,
    reservation: reservationRaw,
    summary: {
      reference,
      room: roomRaw.name,
      checkIn,
      checkOut,
      nights: quote.nights,
      guestCount,
      breakfastLine: quote.breakfastLine,
      extraBedLine: quote.extraBedLine,
      extraBedTotal: quote.extraBedTotal,
      total: quote.total,
      downpaymentRequired: quote.downpaymentRequired,
      amountPaid: paymentAmount,
      downpaymentDefaulted: quote.downpaymentDefaulted
    }
  });
}
