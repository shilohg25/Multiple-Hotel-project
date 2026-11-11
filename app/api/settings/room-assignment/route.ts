import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricingSetup } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  if (!canManagePricingSetup(auth.staff.profile)) return jsonError('Only a manager or owner can assign room types.', 403);

  const payload = await request.json();
  const roomId = String(payload.room_id || '');
  const roomTypeId = String(payload.room_type_id || '');
  const [{ data: room }, { data: roomType }] = await Promise.all([
    supabaseAdmin.from('rooms').select('id, hotel_id, name, room_type_id, room_type_name, base_rate').eq('id', roomId).maybeSingle(),
    supabaseAdmin.from('room_types').select('id, hotel_id, name').eq('id', roomTypeId).maybeSingle()
  ]);
  if (!room || !roomType) return jsonError('Room or room type not found.', 404);
  if (room.hotel_id !== roomType.hotel_id) return jsonError('That room type belongs to a different property.');
  if (!canAccessHotel(auth.staff.profile, room.hotel_id)) return jsonError('Hotel access denied.', 403);

  const { data: walkIn } = await supabaseAdmin
    .from('room_type_channel_rates')
    .select('rate')
    .eq('room_type_id', roomTypeId)
    .eq('channel', 'walk_in')
    .maybeSingle();

  const nextRate = walkIn ? Number(walkIn.rate) : Number(room.base_rate || 0);
  const { data: updated, error } = await supabaseAdmin
    .from('rooms')
    .update({ room_type_id: roomTypeId, room_type_name: roomType.name, base_rate: nextRate })
    .eq('id', roomId)
    .select('*')
    .single();
  if (error || !updated) return jsonError(error?.message || 'Failed to assign room type.', 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: room.hotel_id,
    actor_id: auth.staff.userId,
    action: 'room.type_assigned',
    details: {
      room_id: roomId,
      before: { room_type_id: room.room_type_id, room_type_name: room.room_type_name, base_rate: room.base_rate },
      after: { room_type_id: roomTypeId, room_type_name: roomType.name, base_rate: nextRate }
    }
  });

  return NextResponse.json({ room: updated });
}
