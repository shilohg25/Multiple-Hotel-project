import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { allows } from '@/lib/access';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'approve');
  if (denied) return denied;
  if (!allows(auth.staff.profile.role, 'approve')) return jsonError('Only a manager or owner can lock or unlock a day.', 403);

  const { id } = await params;
  const payload = await request.json();
  const action = String(payload.action || '');
  const { data: current, error } = await supabaseAdmin.from('day_closes').select('*').eq('id', id).maybeSingle();
  if (error || !current) return jsonError('Day close not found.', 404);
  if (!canAccessHotel(auth.staff.profile, current.hotel_id)) return jsonError('Hotel access denied.', 403);

  if (action === 'lock') {
    if (current.status === 'locked') return jsonError('This day is already locked.', 409);
    if (current.variance_status !== 'balanced' && !current.variance_note) return jsonError('A short or excess day needs a note before it can be locked.', 400);
    const { data, error: updateError } = await supabaseAdmin
      .from('day_closes')
      .update({ status: 'locked', locked_by: auth.staff.userId, locked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'draft')
      .select('*')
      .maybeSingle();
    if (updateError || !data) return jsonError(updateError?.message || 'Could not lock the day.', 400);

    if (current.variance_status === 'short' && current.responsible_profile_id) {
      await supabaseAdmin.from('shortage_charges').insert({
        hotel_id: current.hotel_id,
        outlet_id: current.outlet_id,
        business_date: current.business_date,
        day_close_id: current.id,
        staff_profile_id: current.responsible_profile_id,
        amount: Math.abs(Number(current.variance_amount || 0)),
        note: current.variance_note,
        created_by: auth.staff.userId
      });
    }

    await supabaseAdmin.from('audit_logs').insert({
      hotel_id: current.hotel_id,
      actor_id: auth.staff.userId,
      action: 'day_close.locked',
      details: { before: { status: 'draft' }, after: { status: 'locked' }, variance_status: current.variance_status, responsible_profile_id: current.responsible_profile_id }
    });
    return NextResponse.json({ day_close: data });
  }

  if (action === 'unlock') {
    const reason = String(payload.reason || '').trim();
    if (!reason) return jsonError('A reason is required to unlock the day.', 400);
    if (current.status !== 'locked') return jsonError('This day is not locked.', 409);
    const { data, error: updateError } = await supabaseAdmin
      .from('day_closes')
      .update({ status: 'draft', unlocked_by: auth.staff.userId, unlocked_at: new Date().toISOString(), unlock_reason: reason, locked_by: null, locked_at: null })
      .eq('id', id)
      .eq('status', 'locked')
      .select('*')
      .maybeSingle();
    if (updateError || !data) return jsonError(updateError?.message || 'Could not unlock the day.', 400);
    await supabaseAdmin.from('audit_logs').insert({
      hotel_id: current.hotel_id,
      actor_id: auth.staff.userId,
      action: 'day_close.unlocked',
      details: { before: { status: 'locked' }, after: { status: 'draft' }, reason }
    });
    return NextResponse.json({ day_close: data });
  }

  return jsonError('Choose lock or unlock.');
}
