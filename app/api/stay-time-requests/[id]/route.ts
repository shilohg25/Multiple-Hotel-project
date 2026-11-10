import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricingSetup } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

  const { data, error } = await supabaseAdmin.rpc('review_stay_time_request', {
    p_request_id: id,
    p_decision: decision,
    p_note: reviewNote,
    p_actor: auth.staff.userId
  });
  if (error) {
    const message = error.message || 'Could not review this request.';
    return jsonError(message, /already reviewed/i.test(message) ? 409 : 400);
  }

  return NextResponse.json({ request: data });
}
