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
  const countDate = String(payload.count_date || new Date().toISOString().slice(0, 10));

  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!Array.isArray(payload.counts)) return jsonError('Cash count rows are required.');

  const rows = payload.counts
    .map((row: { denomination?: unknown; quantity?: unknown }) => ({
      hotel_id: hotelId,
      count_date: countDate,
      denomination: Number(row.denomination || 0),
      quantity: Math.max(0, Number(row.quantity || 0)),
      created_by: staff.userId
    }))
    .filter((row: { denomination: number; quantity: number }) => Number.isFinite(row.denomination) && row.denomination > 0 && Number.isFinite(row.quantity));

  if (!rows.length) return jsonError('At least one valid cash count row is required.');

  const { data, error } = await supabaseAdmin
    .from('cash_counts')
    .upsert(rows, { onConflict: 'hotel_id,count_date,denomination' })
    .select('*');

  if (error) return jsonError(error.message, 400);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    actor_id: staff.userId,
    action: 'cash_count.saved',
    details: { count_date: countDate, rows: rows.length }
  });

  return NextResponse.json({ counts: data });
}
