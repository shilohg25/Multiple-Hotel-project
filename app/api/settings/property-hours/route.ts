import { NextResponse } from 'next/server';
import { canAccessHotel, canManagePricingSetup } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  if (!canManagePricingSetup(auth.staff.profile)) return jsonError('Only a manager or owner can edit property hours.', 403);

  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const earlyRate = Number(payload.early_checkin_hourly_rate);
  const lateRate = Number(payload.late_checkout_hourly_rate);
  const checkIn = String(payload.check_in_time || '').slice(0, 5);
  const checkOut = String(payload.check_out_time || '').slice(0, 5);
  if (!canAccessHotel(auth.staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!/^\d{2}:\d{2}$/.test(checkIn) || !/^\d{2}:\d{2}$/.test(checkOut)) return jsonError('Enter check-in and check-out as HH:MM.');
  if (!Number.isFinite(earlyRate) || earlyRate < 0 || !Number.isFinite(lateRate) || lateRate < 0) return jsonError('Hourly rates must be zero or more.');

  const { data, error } = await supabaseAdmin
    .from('hotels')
    .update({
      check_in_time: checkIn,
      check_out_time: checkOut,
      early_checkin_hourly_rate: earlyRate,
      late_checkout_hourly_rate: lateRate
    })
    .eq('id', hotelId)
    .select('id, check_in_time, check_out_time, early_checkin_hourly_rate, late_checkout_hourly_rate')
    .single();
  if (error || !data) return jsonError(error?.message || 'Failed to save hours.', 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    actor_id: auth.staff.userId,
    action: 'settings.property_hours_updated',
    details: data
  });
  return NextResponse.json({ hotel: data });
}
