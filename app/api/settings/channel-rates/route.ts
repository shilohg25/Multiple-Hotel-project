import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricingSetup } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { RATE_CHANNELS } from '@/lib/channel-rates';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  if (!canManagePricingSetup(auth.staff.profile)) return jsonError('Only a manager or owner can edit rate defaults.', 403);

  const payload = await request.json();
  const roomTypeId = String(payload.room_type_id || '');
  const { data: roomType, error: typeError } = await supabaseAdmin.from('room_types').select('id, hotel_id, name').eq('id', roomTypeId).maybeSingle();
  if (typeError || !roomType) return jsonError('Room type not found.', 404);
  if (!canAccessHotel(auth.staff.profile, roomType.hotel_id)) return jsonError('Hotel access denied.', 403);

  const saved = [];
  for (const channel of RATE_CHANNELS) {
    if (!(channel in (payload.rates || {}))) continue;
    const rate = Number(payload.rates[channel]);
    if (!Number.isFinite(rate) || rate < 0) return jsonError(`${channel} rate must be zero or more.`);
    const { data, error } = await supabaseAdmin
      .from('room_type_channel_rates')
      .upsert({ room_type_id: roomTypeId, channel, rate }, { onConflict: 'room_type_id,channel' })
      .select('*')
      .single();
    if (error || !data) return jsonError(error?.message || 'Failed to save rate.', 400);
    saved.push(data);
  }

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: roomType.hotel_id,
    actor_id: auth.staff.userId,
    action: 'rate.channel_defaults_updated',
    details: { room_type_id: roomTypeId, room_type: roomType.name, rates: payload.rates }
  });

  return NextResponse.json({ rates: saved });
}
