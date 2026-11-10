import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricingSetup } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { stayTotal } from '@/lib/channel-rates';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  if (!canManagePricingSetup(auth.staff.profile)) return jsonError('Only a manager or owner can approve a rate.', 403);

  const { id } = await params;
  const payload = await request.json();
  const decision = String(payload.status || '');
  const reviewNote = String(payload.review_note || '').trim();
  if (decision !== 'approved' && decision !== 'rejected') return jsonError('Choose approved or rejected.');
  if (!reviewNote) return jsonError('A manager note is required.');

  const { data: current, error: currentError } = await supabaseAdmin.from('rate_override_requests').select('*').eq('id', id).maybeSingle();
  if (currentError || !current) return jsonError('Rate request not found.', 404);
  if (!canAccessHotel(auth.staff.profile, current.hotel_id)) return jsonError('Hotel access denied.', 403);
  if (current.status !== 'pending') return jsonError('This request was already reviewed.', 409);

  let appliedTotal: number | null = null;
  if (decision === 'approved' && current.reservation_id) {
    const { data: reservation, error: reservationError } = await supabaseAdmin
      .from('reservations')
      .select('id, nights, surcharge_amount, posted_room_rate, total_amount')
      .eq('id', current.reservation_id)
      .single();
    if (reservationError || !reservation) return jsonError('Reservation not found.', 404);
    appliedTotal = stayTotal(Number(current.requested_rate), Number(reservation.nights || 0), Number(reservation.surcharge_amount || 0));
    const { error: updateStayError } = await supabaseAdmin
      .from('reservations')
      .update({ posted_room_rate: Number(current.requested_rate), total_amount: appliedTotal })
      .eq('id', reservation.id);
    if (updateStayError) return jsonError(updateStayError.message, 400);
  }

  const { data, error } = await supabaseAdmin
    .from('rate_override_requests')
    .update({
      status: decision,
      review_note: reviewNote,
      reviewed_by: auth.staff.userId,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError('This request was already reviewed.', 409);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: current.hotel_id,
    reservation_id: current.reservation_id,
    actor_id: auth.staff.userId,
    action: `rate.override_${decision}`,
    details: {
      request_id: id,
      before: { status: current.status, posted_room_rate: null },
      after: { status: decision, requested_rate: current.requested_rate, total_amount: appliedTotal },
      reason: current.reason,
      review_note: reviewNote
    }
  });

  return NextResponse.json({ request: data });
}
