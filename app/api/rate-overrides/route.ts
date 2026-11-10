import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { RATE_CHANNELS } from '@/lib/channel-rates';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const reason = String(payload.reason || '').trim();
  const channel = String(payload.channel || '');
  const requestedRate = Number(payload.requested_rate);
  if (!canAccessHotel(auth.staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!RATE_CHANNELS.includes(channel as (typeof RATE_CHANNELS)[number])) return jsonError('Choose walk-in, OTA, or short-time.');
  if (!reason) return jsonError('A reason is required to request a different rate.');
  if (!Number.isFinite(requestedRate) || requestedRate < 0) return jsonError('Requested rate must be zero or more.');

  const { data, error } = await supabaseAdmin
    .from('rate_override_requests')
    .insert({
      hotel_id: hotelId,
      reservation_id: payload.reservation_id || null,
      room_type_id: payload.room_type_id || null,
      channel,
      requested_rate: requestedRate,
      reason,
      status: 'pending',
      requested_by: auth.staff.userId
    })
    .select('*')
    .single();
  if (error || !data) return jsonError(error?.message || 'Failed to request the rate.', 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    reservation_id: payload.reservation_id || null,
    actor_id: auth.staff.userId,
    action: 'rate.override_requested',
    details: { request_id: data.id, channel, requested_rate: requestedRate, reason }
  });

  return NextResponse.json({ request: data });
}
