import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

function cleanFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/-+/g, '-').slice(0, 100) || 'proof';
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;

  const form = await request.formData();
  const reservationId = String(form.get('reservation_id') || '');
  const amount = Number(form.get('amount') || 0);
  const method = String(form.get('method') || 'other');
  const proof = form.get('proof');

  if (!reservationId) return jsonError('Reservation is required.');
  if (!Number.isFinite(amount) || amount <= 0) return jsonError('Payment amount must be greater than zero.');
  if (!(proof instanceof File) || proof.size === 0) return jsonError('Payment proof is mandatory.');

  const { data: reservation, error: reservationError } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .single();
  if (reservationError || !reservation) return jsonError('Reservation not found.', 404);
  if (!canAccessHotel(staff.profile, reservation.hotel_id)) return jsonError('Hotel access denied.', 403);

  const path = `${reservation.hotel_id}/${reservationId}/${Date.now()}-${cleanFileName(proof.name)}`;
  const buffer = Buffer.from(await proof.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from('payment-proofs')
    .upload(path, buffer, {
      contentType: proof.type || 'application/octet-stream',
      upsert: false
    });

  if (uploadError) return jsonError(uploadError.message, 400);

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('payments')
    .insert({
      reservation_id: reservationId,
      amount,
      method,
      proof_path: path,
      proof_original_name: proof.name,
      status: 'submitted'
    })
    .select('*')
    .single();

  if (paymentError) return jsonError(paymentError.message, 400);

  await supabaseAdmin
    .from('reservations')
    .update({ status: 'payment_submitted' })
    .eq('id', reservationId)
    .in('status', ['tentative', 'payment_submitted']);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: reservation.hotel_id,
    reservation_id: reservationId,
    actor_id: staff.userId,
    action: 'payment.proof_submitted',
    details: { payment_id: payment.id, amount, method }
  });

  return NextResponse.json({ payment });
}
