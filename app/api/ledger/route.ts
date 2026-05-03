import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const entryDate = String(payload.entry_date || new Date().toISOString().slice(0, 10));
  const amount = Number(payload.amount || 0);

  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!Number.isFinite(amount)) return jsonError('Amount must be a valid number.');

  const { data, error } = await supabaseAdmin
    .from('ledger_entries')
    .insert({
      hotel_id: hotelId,
      entry_date: entryDate,
      category: String(payload.category || 'room'),
      description: String(payload.description || '').trim() || null,
      amount,
      payment_method: payload.payment_method || 'cash',
      is_collectible: payload.is_collectible === true || payload.is_collectible === 'true',
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
