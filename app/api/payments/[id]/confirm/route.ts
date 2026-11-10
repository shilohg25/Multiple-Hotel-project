import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePayments } from '@/lib/auth';
import { businessToday } from '@/lib/date';
import { paymentReceiptDate } from '@/lib/payment-confirm';
import { lockedDayMessage } from '@/lib/day-lock';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { isRoomOverlapError, ROOM_JUST_TAKEN } from '@/lib/room-overlap';
import { unavailableDatabaseFunction } from '@/lib/supabase-errors';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Guest, Hotel, Reservation } from '@/types/app';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'approve');
  if (denied) return denied;
  const staff = auth.staff;
  if (!canManagePayments(staff.profile)) return jsonError('Payment confirmation requires owner or manager access.', 403);

  const { id } = await params;
  const payload = await request.json().catch(() => ({} as { received_on?: string }));
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('payments')
    .select('*, reservations(*, guests(*), hotels(*))')
    .eq('id', id)
    .single();

  if (paymentError || !payment) return jsonError('Payment not found.', 404);
  const reservation = payment.reservations as Reservation & { guests: Guest; hotels: Hotel };
  if (!canAccessHotel(staff.profile, reservation.hotel_id)) return jsonError('Hotel access denied.', 403);
  if (!payment.proof_path) return jsonError('Payment proof is mandatory before confirmation.');

  const today = businessToday(reservation.hotels?.timezone);
  const receivedText = String(payload?.received_on || payment.received_on || '').trim();
  const receivedOn = /^\d{4}-\d{2}-\d{2}$/.test(receivedText) ? receivedText : null;
  const receipt = paymentReceiptDate(receivedOn, today);
  if (!receipt.ok) return jsonError(receipt.error, 400);
  const entryDate = receipt.date;
  const locked = await lockedDayMessage(reservation.hotel_id, entryDate, null);
  if (locked) return jsonError(locked, 409);

  const { data, error } = await supabaseAdmin.rpc('confirm_submitted_payment', {
    p_payment_id: id,
    p_actor: staff.userId,
    p_entry_date: entryDate,
    p_received_on: receivedOn
  });
  if (error) {
    if (isRoomOverlapError(error)) {
      console.error(error);
      return jsonError(ROOM_JUST_TAKEN);
    }
    const unavailable = unavailableDatabaseFunction(error);
    if (unavailable) return jsonError(unavailable, 503);
    const message = error.message || 'Could not confirm this payment.';
    const status = /locked/i.test(message) ? 409 : /awaiting confirmation|not found/i.test(message) ? 409 : 400;
    return jsonError(message, status);
  }

  return NextResponse.json(data);
}
