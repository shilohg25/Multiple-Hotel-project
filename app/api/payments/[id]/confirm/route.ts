import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePayments } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendBookingConfirmationEmail } from '@/lib/email';
import type { Guest, Hotel, Reservation } from '@/types/app';

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManagePayments(staff.profile)) return jsonError('Payment confirmation requires owner, manager, or accounting access.', 403);

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

  const { error: updatePaymentError } = await supabaseAdmin
    .from('payments')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: staff.userId })
    .eq('id', id);
  if (updatePaymentError) return jsonError(updatePaymentError.message, 400);

  const { data: confirmedPayments, error: sumError } = await supabaseAdmin
    .from('payments')
    .select('amount')
    .eq('reservation_id', reservation.id)
    .eq('status', 'confirmed');
  if (sumError) return jsonError(sumError.message, 400);

  const confirmedTotal = (confirmedPayments || []).reduce((sum: number, item: { amount: number | string | null }) => sum + Number(item.amount || 0), 0);
  let statusUpdated = false;

  if (confirmedTotal >= Number(reservation.downpayment_required || 0)) {
    const { data: updatedReservation, error: reservationUpdateError } = await supabaseAdmin
      .from('reservations')
      .update({ status: 'secured' })
      .eq('id', reservation.id)
      .select('*, guests(*), hotels(*)')
      .single();

    if (reservationUpdateError) return jsonError(reservationUpdateError.message, 400);
    statusUpdated = true;

    await sendBookingConfirmationEmail({
      hotel: updatedReservation.hotels as Hotel,
      guest: updatedReservation.guests as Guest,
      reservation: updatedReservation as Reservation
    });
  }

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: reservation.hotel_id,
    reservation_id: reservation.id,
    actor_id: staff.userId,
    action: 'payment.confirmed',
    details: { payment_id: id, confirmed_total: confirmedTotal, status_updated: statusUpdated }
  });

  return NextResponse.json({ confirmed_total: confirmedTotal, status_updated: statusUpdated });
}
