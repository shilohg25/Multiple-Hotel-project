import { NextResponse } from 'next/server';
import { canAccessHotel, canManageRemittances } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

const statuses = ['pending', 'partial', 'remitted', 'cancelled'];

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManageRemittances(staff.profile)) return jsonError('Owner or manager access is required to manage remittances.', 403);

  const { id } = await params;
  const payload = await request.json();
  const status = String(payload.status || 'pending');
  if (!statuses.includes(status)) return jsonError('Invalid remittance status.');

  const { data: current, error: currentError } = await supabaseAdmin
    .from('remittances')
    .select('*')
    .eq('id', id)
    .single();
  if (currentError || !current) return jsonError('Remittance not found.', 404);
  if (!canAccessHotel(staff.profile, current.from_hotel_id)) return jsonError('Hotel access denied.', 403);

  const { data, error } = await supabaseAdmin
    .from('remittances')
    .update({
      amount_paid: Number(payload.amount_paid || 0),
      status,
      paid_at: status === 'remitted' ? new Date().toISOString() : current.paid_at,
      notes: optionalText(payload.notes)
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) return jsonError(error?.message || 'Failed to update remittance.', 400);
  return NextResponse.json({ remittance: data });
}
