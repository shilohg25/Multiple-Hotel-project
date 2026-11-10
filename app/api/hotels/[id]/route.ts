import { NextResponse } from 'next/server';
import { requireApiStaff, jsonError } from '@/lib/api';
import { businessTimeZone } from '@/lib/date';
import { supabaseAdmin } from '@/lib/supabase-admin';

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  if (auth.staff.profile.role !== 'owner') return jsonError('Only owners can edit property setup.', 403);

  const { id } = await params;
  const payload = await request.json();
  const update: Record<string, unknown> = {};
  if ('legal_name' in payload) update.legal_name = optionalText(payload.legal_name);
  if ('timezone' in payload) update.timezone = businessTimeZone(optionalText(payload.timezone));
  if ('is_reporting_unit' in payload) update.is_reporting_unit = Boolean(payload.is_reporting_unit);
  if (!Object.keys(update).length) return jsonError('Nothing to update.');

  const { data, error } = await supabaseAdmin.from('hotels').update(update).eq('id', id).select('*').single();
  if (error || !data) return jsonError(error?.message || 'Failed to update hotel.', 400);
  return NextResponse.json({ hotel: data });
}
