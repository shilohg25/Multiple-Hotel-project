import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePayments } from '@/lib/auth';
import { businessToday } from '@/lib/date';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { reservationStatusAfterConfirm } from '@/lib/payment-confirm';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Guest, Hotel, Reservation } from '@/types/app';

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'approve');
  if (denied) return denied;
  const staff = auth.staff;
  if (!canManagePayments(staff.profile)) return jsonError('Payment confirmation requires owner or manager access.', 403);

  const { id } = await params;
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from('payments')
    .select('*, reservations(*, guests(*), hotels(*))')
    .eq('id', id)
    .single();

  if (paymentError || !payment) return jsonError('Payment not found.', 404);
  const reservation = payment.reservations as Reservation & { guests: Guest; hotels: Hotel };
  if (!canAccessHotel(staff.profile, reservation.hotel_id)) return jsonError('Hotel access denied.', 403);
  if (!payment.proof_path) return jsonError('Payment proof is mandatory before confirmation.');

  const entryDate = businessToday(reservation.hotels?.timezone);

  const { data: confirmedRow, error: updatePaymentError } = await supabaseAdmin
    .from('payments')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: staff.userId })
    .eq('id', id)
    .eq('status', 'submitted')
    .select('id')
    .maybeSingle();
  if (updatePaymentError) return jsonError(updatePaymentError.message, 400);
  if (!confirmedRow) return jsonError('Payment is not awaiting confirmation.', 409);

  const { data: confirmedPayments, error: sumError } = await supabaseAdmin
    .from('payments')
    .select('amount')
    .eq('reservation_id', reservation.id)
    .eq('status', 'confirmed');
  if (sumError) return jsonError(sumError.message, 400);

  const confirmedTotal = (confirmedPayments || []).reduce((sum: number, item: { amount: number | string | null }) => sum + Number(item.amount || 0), 0);
  let statusUpdated = false;
  const nextStatus = reservationStatusAfterConfirm(reservation.status, confirmedTotal, Number(reservation.downpayment_required || 0));

  if (nextStatus) {
    const { error: reservationUpdateError } = await supabaseAdmin
      .from('reservations')
      .update({ status: nextStatus })
      .eq('id', reservation.id);

    if (reservationUpdateError) {
      await supabaseAdmin.from('payments').update({ status: 'submitted', confirmed_at: null, confirmed_by: null }).eq('id', id);
      return jsonError(
        `${reservationUpdateError.message}. Another secured booking may already block this room/date. Tentative records can overlap, but secured bookings cannot.`,
        400
      );
    }
    statusUpdated = true;
  }

  await supabaseAdmin.from('ledger_entries').insert({
    hotel_id: reservation.hotel_id,
    reservation_id: reservation.id,
    entry_date: entryDate,
    category: 'room_payment',
    description: `Confirmed payment for ${reservation.guests?.full_name || 'guest'} (${id})`,
    amount: Number(payment.amount || 0),
    payment_method: payment.method || 'other',
    is_collectible: false,
    created_by: staff.userId
  });

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: reservation.hotel_id,
    reservation_id: reservation.id,
    actor_id: staff.userId,
    action: 'payment.confirmed',
    details: { payment_id: id, confirmed_total: confirmedTotal, status_updated: statusUpdated }
  });

  return NextResponse.json({ confirmed_total: confirmedTotal, status_updated: statusUpdated });
}
