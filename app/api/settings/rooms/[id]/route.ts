import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricing } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function moneyChanged(oldValue: unknown, newValue: number) {
  return Math.round(Number(oldValue || 0) * 100) !== Math.round(newValue * 100);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManagePricing(staff.profile)) return jsonError('Only owners can manage room pricing.', 403);

  const { id } = await params;
  const payload = await request.json();
  const baseRate = Number(payload.base_rate ?? 0);
  const capacity = Number(payload.capacity ?? 1);

  if (!Number.isFinite(baseRate) || baseRate < 0) return jsonError('Base rate must be a valid non-negative number.');
  if (!Number.isFinite(capacity) || capacity < 1) return jsonError('Capacity must be at least 1.');

  const { data: current, error: currentError } = await supabaseAdmin
    .from('rooms')
    .select('*')
    .eq('id', id)
    .single();
  if (currentError || !current) return jsonError('Room not found.', 404);
  if (!canAccessHotel(staff.profile, current.hotel_id)) return jsonError('Hotel access denied.', 403);

  const { data: room, error: updateError } = await supabaseAdmin
    .from('rooms')
    .update({
      base_rate: baseRate,
      capacity: Math.floor(capacity),
      room_type_name: optionalText(payload.room_type_name),
      active: Boolean(payload.active)
    })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError || !room) return jsonError(updateError?.message || 'Failed to update room.', 400);

  if (moneyChanged(current.base_rate, baseRate)) {
    const { error: logError } = await supabaseAdmin.from('price_change_logs').insert({
      hotel_id: current.hotel_id,
      room_id: id,
      changed_type: 'room_price',
      old_value: Number(current.base_rate || 0),
      new_value: baseRate,
      changed_by: staff.userId,
      notes: `Room ${current.name} base rate changed`
    });
    if (logError) return jsonError(`Room saved, but price history failed: ${logError.message}`, 400);
  }

  return NextResponse.json({ room });
}
