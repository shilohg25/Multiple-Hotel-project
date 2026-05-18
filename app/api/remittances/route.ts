import { NextResponse } from 'next/server';
import { canAccessHotel, canManageRemittances } from '@/lib/auth';
import { jsonError, requireApiStaff } from '@/lib/api';
import { supabaseAdmin } from '@/lib/supabase-admin';

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const staff = auth.staff;
  if (!canManageRemittances(staff.profile)) return jsonError('Owner or manager access is required to manage remittances.', 403);

  const payload = await request.json();
  const hotelId = String(payload.from_hotel_id || '');
  const periodStart = String(payload.period_start || '');
  const periodEnd = String(payload.period_end || '');
  const chargeIds = Array.isArray(payload.reservation_charge_ids) ? payload.reservation_charge_ids.map(String) : [];

  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!periodStart || !periodEnd || periodEnd < periodStart) return jsonError('Valid remittance period is required.');
  if (!chargeIds.length) return jsonError('Choose at least one remittance due item.');

  const { data: charges, error: chargeError } = await supabaseAdmin
    .from('reservation_charges')
    .select('*')
    .in('id', chargeIds)
    .eq('hotel_id', hotelId)
    .eq('remittance_required', true);
  if (chargeError) return jsonError(chargeError.message, 400);
  if (!charges?.length) return jsonError('No valid remittance items found.');

  const amountDue = charges.reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0);
  const { data: remittance, error: remittanceError } = await supabaseAdmin
    .from('remittances')
    .insert({
      from_hotel_id: hotelId,
      to_outlet_id: optionalText(payload.to_outlet_id),
      period_start: periodStart,
      period_end: periodEnd,
      amount_due: amountDue,
      amount_paid: Number(payload.amount_paid || 0),
      status: String(payload.status || 'pending'),
      paid_at: payload.status === 'remitted' ? new Date().toISOString() : null,
      notes: optionalText(payload.notes),
      created_by: staff.userId
    })
    .select('*')
    .single();
  if (remittanceError || !remittance) return jsonError(remittanceError?.message || 'Failed to create remittance.', 400);

  const rows = charges.map((charge) => ({
    remittance_id: remittance.id,
    reservation_charge_id: charge.id,
    description: charge.description,
    amount: Number(charge.total_amount || 0)
  }));
  const { error: itemsError } = await supabaseAdmin.from('remittance_items').insert(rows);
  if (itemsError) return jsonError(itemsError.message, 400);

  return NextResponse.json({ remittance });
}
