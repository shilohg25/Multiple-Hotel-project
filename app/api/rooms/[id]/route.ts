import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricingSetup } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

function toBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value) === 'true' || String(value) === 'on';
}

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManagePricingSetup(staff.profile)) return jsonError('Owner or manager access is required to edit rooms/units.', 403);

  const { id } = await params;
  const payload = await request.json();

  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('*')
    .eq('id', id)
    .single();

  if (roomError || !room) return jsonError('Room/unit not found.', 404);
  if (!canAccessHotel(staff.profile, room.hotel_id)) return jsonError('Hotel access denied.', 403);

  const name = optionalText(payload.name);
  if (payload.name !== undefined && !name) return jsonError('Room/unit name is required.');

  const nextBaseRate = payload.base_rate === undefined ? Number(room.base_rate || 0) : Number(payload.base_rate || 0);
  if (!Number.isFinite(nextBaseRate) || nextBaseRate < 0) return jsonError('Base rate must be a valid non-negative number.');

  const updates = {
    name: name ?? room.name,
    room_type_name: payload.room_type_name === undefined ? room.room_type_name : optionalText(payload.room_type_name),
    capacity: Math.max(1, Number(payload.capacity ?? room.capacity ?? 2)),
    base_rate: nextBaseRate,
    sort_order: Number(payload.sort_order ?? room.sort_order ?? 100),
    active: toBoolean(payload.active, Boolean(room.active))
  };

  const { data: updatedRoom, error: updateError } = await supabaseAdmin
    .from('rooms')
    .update(updates)
    .eq('id', room.id)
    .select('*')
    .single();

  if (updateError || !updatedRoom) {
    if (updateError?.code === '23505') {
      return jsonError('A room/unit with this name already exists for this hotel/property.', 409);
    }
    return jsonError(updateError?.message || 'Failed to update room/unit.', 400);
  }

  const oldRate = Number(room.base_rate || 0);
  if (oldRate !== nextBaseRate) {
    // Older installs may not have price_change_logs yet; room updates should still succeed.
    await supabaseAdmin.from('price_change_logs').insert({
      hotel_id: room.hotel_id,
      room_id: room.id,
      changed_type: 'room_price',
      old_value: oldRate,
      new_value: nextBaseRate,
      changed_by: staff.userId,
      notes: 'Room/unit setup edit'
    });
  }

  return NextResponse.json({ room: updatedRoom });
}
