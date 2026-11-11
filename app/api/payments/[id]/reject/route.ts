import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePayments } from '@/lib/auth';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { shouldReleaseHoldOnReject } from '@/lib/payment-reject';
import { unavailableDatabaseFunction } from '@/lib/supabase-errors';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Guest, Hotel, Reservation } from '@/types/app';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'approve');
  if (denied) return denied;
  const staff = auth.staff;
  if (!canManagePayments(staff.profile)) return jsonError('Payment rejection requires owner or manager access.', 403);

  const { id } = await params;
  const payload = await request.json().catch(() => ({} as { reason?: string }));
  const reason = String(payload?.reason || '').trim();
  if (!reason) return jsonError('A reason is required to reject a payment.');

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('payments')
    .select('*, reservations(*, hotels(*))')
    .eq('id', id)
    .single();
  if (paymentError || !payment) return jsonError('Payment not found.', 404);
  const reservation = payment.reservations as Reservation & { guests?: Guest; hotels?: Hotel };
  if (!canAccessHotel(staff.profile, reservation.hotel_id)) return jsonError('Hotel access denied.', 403);

  const { data, error } = await supabaseAdmin.rpc('reject_submitted_payment', {
    p_payment_id: id,
    p_actor: staff.userId,
    p_reason: reason
  });
  if (error) {
    const unavailable = unavailableDatabaseFunction(error);
    if (unavailable) return jsonError(unavailable, 503);
    const message = error.message || 'Could not reject this payment.';
    return jsonError(message, /awaiting confirmation|not found/i.test(message) ? 409 : 400);
  }

  if (reservation.status === 'payment_submitted') {
    const { data: others, error: othersError } = await supabaseAdmin
      .from('payments')
      .select('status')
      .eq('reservation_id', reservation.id)
      .neq('id', id);
    if (othersError) {
      console.error(othersError);
      return jsonError('The payment was rejected, but the room could not be checked. Open the stay and confirm it still holds the room.', 500);
    }
    const release = shouldReleaseHoldOnReject({
      reservationStatus: reservation.status,
      otherPaymentStatuses: (others || []).map((row) => String(row.status))
    });
    if (release) {
      const { error: releaseError } = await supabaseAdmin
        .from('reservations')
        .update({ status: 'cancelled' })
        .eq('id', reservation.id)
        .eq('status', 'payment_submitted');
      if (releaseError) {
        console.error(releaseError);
        return jsonError('The payment was rejected, but the room could not be released. Cancel the stay from the reservation.', 500);
      }
    }
  }

  return NextResponse.json(data);
}
