import { NextResponse } from 'next/server';
import { requireApiStaff, jsonError, denyUnless } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'owner');
  if (denied) return denied;
  if (auth.staff.profile.role !== 'owner') return jsonError('Only owners can edit outlets.', 403);

  const { id } = await params;
  const payload = await request.json();
  const update: Record<string, unknown> = {};
  if ('legal_name' in payload) update.legal_name = optionalText(payload.legal_name);
  if ('name' in payload) {
    const name = String(payload.name || '').trim();
    if (!name) return jsonError('Outlet name is required.');
    update.name = name;
  }
  if ('is_reporting_unit' in payload) update.is_reporting_unit = Boolean(payload.is_reporting_unit);
  if ('active' in payload) update.active = Boolean(payload.active);
  if (!Object.keys(update).length) return jsonError('Nothing to update.');

  const { data, error } = await supabaseAdmin.from('outlets').update(update).eq('id', id).select('*').single();
  if (error || !data) return jsonError(error?.message || 'Failed to update outlet.', 400);
  return NextResponse.json({ outlet: data });
}
