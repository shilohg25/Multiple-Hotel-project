import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hasReservationConflict } from '@/lib/availability';
import { sendHouseRulesEmail } from '@/lib/email';
import type { Guest, Hotel, Reservation } from '@/types/app';

export const runtime = 'nodejs';

function cleanFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/-+/g, '-').slice(0, 100) || 'proof';
}

export async function POST(request: Request) {
  const form = await request.formData();
  const hotelId = String(form.get('hotel_id') || '');
  const roomId = String(form.get('room_id') || '');
  const guestName = String(form.get('guest_name') || '').trim();
  const guestEmail = String(form.get('guest_email') || '').trim();
  const guestPhone = String(form.get('guest_phone') || '').trim();
  const checkIn = String(form.get('check_in') || '');
  const checkOut = String(form.get('check_out') || '');
  const proof = form.get('proof');
  const paymentAmount = Number(form.get('payment_amount') || 0);

  if (!hotelId || !roomId) return jsonError('Hotel and room are required.');
  if (!guestName || !guestEmail || !guestPhone) return jsonError('Name, email, and phone are required.');
  if (!checkIn || !checkOut || checkOut <= checkIn) return jsonError('Valid check-in and check-out dates are required.');
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return jsonError('Down payment amount is required.');
  if (!(proof instanceof File) || proof.size === 0) return jsonError('Payment proof is mandatory.');

  const { data: hotelRaw, error: hotelError } = await supabaseAdmin.from('hotels').select('*').eq('id', hotelId).eq('active', true).single();
  if (hotelError || !hotelRaw) return jsonError('Hotel not found.', 404);

  const { data: roomRaw, error: roomError } = await supabaseAdmin.from('rooms').select('*').eq('id', roomId).eq('hotel_id', hotelId).eq('active', true).single();
  if (roomError || !roomRaw) return jsonError('Room not found.', 404);

  const conflict = await hasReservationConflict({ roomId, checkIn, checkOut });
  if (conflict) return jsonError('This room is already secured for the selected dates. Please choose another date or room.');

  const reservationId = crypto.randomUUID();
  const proofPath = `${hotelId}/${reservationId}/${Date.now()}-${cleanFileName(proof.name)}`;
  const buffer = Buffer.from(await proof.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from('payment-proofs')
    .upload(proofPath, buffer, { contentType: proof.type || 'application/octet-stream', upsert: false });
  if (uploadError) return jsonError(uploadError.message, 400);

  const { data: guestRaw, error: guestError } = await supabaseAdmin
    .from('guests')
    .insert({ full_name: guestName, email: guestEmail, phone: guestPhone })
    .select('*')
    .single();
  if (guestError || !guestRaw) {
    await supabaseAdmin.storage.from('payment-proofs').remove([proofPath]);
    return jsonError(guestError?.message || 'Failed to save guest.');
  }

  const totalAmount = Number(form.get('total_amount') || 0);
  const downpaymentRequired = Number(form.get('downpayment_required') || 0);

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
      guest_count: Number(form.get('guest_count') || 1),
      with_breakfast: String(form.get('with_breakfast')) === 'true',
      posted_room_rate: Number(form.get('posted_room_rate') || roomRaw.base_rate || 0),
      surcharge_label: null,
      surcharge_amount: Number(form.get('surcharge_amount') || 0),
      total_amount: totalAmount,
      downpayment_required: downpaymentRequired,
      notes: form.get('notes') ? String(form.get('notes')) : null
    })
    .select('*')
    .single();
  if (reservationError || !reservationRaw) {
    await supabaseAdmin.storage.from('payment-proofs').remove([proofPath]);
    await supabaseAdmin.from('guests').delete().eq('id', guestRaw.id);
    return jsonError(reservationError?.message || 'Failed to create reservation.');
  }

  const { error: paymentError } = await supabaseAdmin.from('payments').insert({
    reservation_id: reservationRaw.id,
    amount: paymentAmount,
    method: form.get('payment_method') || 'other',
    proof_path: proofPath,
    proof_original_name: proof.name,
    status: 'submitted'
  });
  if (paymentError) {
    await supabaseAdmin.from('reservations').delete().eq('id', reservationRaw.id);
    await supabaseAdmin.storage.from('payment-proofs').remove([proofPath]);
    return jsonError(paymentError.message, 400);
  }

  await sendHouseRulesEmail({
    hotel: hotelRaw as Hotel,
    guest: guestRaw as Guest,
    reservation: reservationRaw as Reservation
  });

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    reservation_id: reservationRaw.id,
    action: 'public_booking.created',
    details: { payment_amount: paymentAmount, payment_method: form.get('payment_method') || 'other' }
  });

  return NextResponse.json({ reservation: reservationRaw });
}
