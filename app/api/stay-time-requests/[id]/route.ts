import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricingSetup } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { hourlyCharge } from '@/lib/stay-hours';
import { supabaseAdmin } from '@/lib/supabase-admin';

function isGeneratedTotal(error: { message?: string } | null) {
  const message = error?.message || '';
  return message.includes('generated column') || message.includes('total_amount');
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  if (!canManagePricingSetup(auth.staff.profile)) return jsonError('Only a manager or owner can approve this charge.', 403);

  const { id } = await params;
  const payload = await request.json();
  const decision = String(payload.status || '');
  const reviewNote = String(payload.review_note || '').trim();
  if (decision !== 'approved' && decision !== 'rejected') return jsonError('Choose approved or rejected.');
  if (!reviewNote) return jsonError('A manager note is required.');

  const { data: current, error: currentError } = await supabaseAdmin.from('stay_time_requests').select('*').eq('id', id).maybeSingle();
  if (currentError || !current) return jsonError('Request not found.', 404);
  if (!canAccessHotel(auth.staff.profile, current.hotel_id)) return jsonError('Hotel access denied.', 403);
  if (current.status !== 'pending') return jsonError('This request was already reviewed.', 409);

  const { data, error } = await supabaseAdmin
    .from('stay_time_requests')
    .update({ status: decision, review_note: reviewNote, reviewed_by: auth.staff.userId, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError('This request was already reviewed.', 409);

  if (decision === 'approved') {
    const amount = hourlyCharge(Number(current.hours), Number(current.hourly_rate));
    const serviceName = current.kind === 'early_check_in' ? 'Early check-in' : 'Late checkout';
    const { data: service } = await supabaseAdmin
      .from('service_items')
      .select('id, category')
      .eq('hotel_id', current.hotel_id)
      .ilike('name', serviceName)
      .maybeSingle();
    const charge = {
      reservation_id: current.reservation_id,
      hotel_id: current.hotel_id,
      service_item_id: service?.id || null,
      description: `${serviceName} ${current.hours} hour(s) at ${current.hourly_rate}`,
      category: service?.category || (current.kind === 'early_check_in' ? 'early_checkin' : 'late_checkout'),
      quantity: Number(current.hours),
      unit_price: Number(current.hourly_rate),
      total_amount: amount,
      notes: current.reason,
      created_by: auth.staff.userId
    };
    let inserted = await supabaseAdmin.from('reservation_charges').insert(charge).select('id').single();
    if (inserted.error && isGeneratedTotal(inserted.error)) {
      const { total_amount: _ignored, ...withoutTotal } = charge;
      inserted = await supabaseAdmin.from('reservation_charges').insert(withoutTotal).select('id').single();
    }
    if (inserted.error) {
      await supabaseAdmin.from('stay_time_requests').update({ status: 'pending', review_note: null, reviewed_by: null, reviewed_at: null }).eq('id', id);
      return jsonError(inserted.error.message, 400);
    }
  }

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: current.hotel_id,
    reservation_id: current.reservation_id,
    actor_id: auth.staff.userId,
    action: `stay_time.${decision}`,
    details: { request_id: id, before: { status: 'pending' }, after: { status: decision }, reason: current.reason, review_note: reviewNote }
  });
  return NextResponse.json({ request: data });
}
