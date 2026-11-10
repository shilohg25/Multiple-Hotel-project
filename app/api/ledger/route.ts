import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { businessDateForHotel } from '@/lib/business-date';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { lockedDayMessage, verifiedOutletId } from '@/lib/day-lock';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'daily');
  if (denied) return denied;
  const staff = auth.staff;
  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const entryDate = await businessDateForHotel(hotelId, payload.entry_date);
  const amount = Number(payload.amount || 0);

  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  const outletId = await verifiedOutletId(hotelId, payload.outlet_id);
  const locked = await lockedDayMessage(hotelId, entryDate, outletId);
  if (locked) return jsonError(locked, 409);
  if (!Number.isFinite(amount)) return jsonError('Amount must be a valid number.');
  const category = String(payload.category || 'room');
  const collectible = category === 'collectible' || payload.is_collectible === true || payload.is_collectible === 'true';

  const { data, error } = await supabaseAdmin
    .from('ledger_entries')
    .insert({
      hotel_id: hotelId,
      outlet_id: outletId,
      entry_date: entryDate,
      category,
      description: String(payload.description || '').trim() || null,
      amount,
      payment_method: payload.payment_method || 'cash',
      is_collectible: collectible,
      created_by: staff.userId
    })
    .select('*')
    .single();

  if (error) return jsonError(error.message, 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    actor_id: staff.userId,
    action: 'ledger.entry_created',
    details: { entry_id: data.id, amount, entry_date: entryDate }
  });

  return NextResponse.json({ entry: data });
}
