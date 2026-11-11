import { NextResponse } from 'next/server';
import { canAccessHotel, canManageServiceCatalog } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  if (!canManageServiceCatalog(auth.staff.profile)) return jsonError('Only a manager or owner can edit breakfast settings.', 403);

  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const perRoom = Number(payload.breakfast_rate_per_room);
  const perHead = Number(payload.breakfast_outlet_portion_per_head);
  if (!canAccessHotel(auth.staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!Number.isFinite(perRoom) || perRoom < 0 || !Number.isFinite(perHead) || perHead < 0) {
    return jsonError('Breakfast amounts must be zero or more.');
  }

  const { data, error } = await supabaseAdmin
    .from('hotels')
    .update({ breakfast_rate_per_room: perRoom, breakfast_outlet_portion_per_head: perHead })
    .eq('id', hotelId)
    .select('id, breakfast_rate_per_room, breakfast_outlet_portion_per_head')
    .single();
  if (error || !data) return jsonError(error?.message || 'Failed to save breakfast settings.', 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    actor_id: auth.staff.userId,
    action: 'settings.breakfast_updated',
    details: { breakfast_rate_per_room: perRoom, breakfast_outlet_portion_per_head: perHead }
  });

  return NextResponse.json({ hotel: data });
}
