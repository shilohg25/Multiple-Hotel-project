import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricingSetup } from '@/lib/auth';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'settings');
  if (denied) return denied;
  if (!canManagePricingSetup(auth.staff.profile)) return jsonError('Only a manager or owner can edit payment channels.', 403);

  const { id } = await params;
  const payload = await request.json();
  const surcharge = Number(payload.surcharge_percent);
  const mdr = Number(payload.mdr_percent);
  if (!Number.isFinite(surcharge) || surcharge < 0 || surcharge > 100) return jsonError('Surcharge percent must be from 0 to 100.');
  if (!Number.isFinite(mdr) || mdr < 0 || mdr > 100) return jsonError('MDR percent must be from 0 to 100.');

  const { data: current, error: currentError } = await supabaseAdmin.from('payment_channels').select('*').eq('id', id).maybeSingle();
  if (currentError || !current) return jsonError('Payment channel not found.', 404);
  if (!canAccessHotel(auth.staff.profile, current.hotel_id)) return jsonError('Hotel access denied.', 403);

  const { data, error } = await supabaseAdmin
    .from('payment_channels')
    .update({
      name: String(payload.name || current.name).trim(),
      surcharge_percent: surcharge,
      mdr_percent: mdr,
      requires_proof: Boolean(payload.requires_proof),
      active: payload.active === undefined ? current.active : Boolean(payload.active)
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) return jsonError(error?.message || 'Failed to save the channel.', 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: current.hotel_id,
    actor_id: auth.staff.userId,
    action: 'payment_channel.updated',
    details: {
      before: { surcharge_percent: current.surcharge_percent, mdr_percent: current.mdr_percent, name: current.name },
      after: { surcharge_percent: surcharge, mdr_percent: mdr, name: data.name }
    }
  });
  return NextResponse.json({ channel: data });
}
