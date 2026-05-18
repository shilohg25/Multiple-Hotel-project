import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricingSetup } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

function toBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value) === 'true' || String(value) === 'on';
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManagePricingSetup(staff.profile)) return jsonError('Owner or manager access is required to manage rooms/units.', 403);

  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);

  const name = String(payload.name || '').trim();
  if (!name) return jsonError('Room name is required.');

  const { data, error: insertError } = await supabaseAdmin
    .from('rooms')
    .insert({
      hotel_id: hotelId,
      name,
      room_type_name: payload.room_type_name || null,
      capacity: Number(payload.capacity || 2),
      base_rate: Number(payload.base_rate || 0),
      sort_order: Number(payload.sort_order || 100),
      active: toBoolean(payload.active, true)
    })
    .select('*')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return jsonError('A room/unit with this name already exists for this hotel/property.', 409);
    }
    return jsonError(insertError.message, 400);
  }
  return NextResponse.json({ room: data });
}
