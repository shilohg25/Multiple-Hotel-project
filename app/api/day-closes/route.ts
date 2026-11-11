import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { countTotal, figuresFromLedger, summarizeClose, type LedgerLike } from '@/lib/day-close';
import { verifiedOutletId } from '@/lib/day-lock';
import { supabaseAdmin } from '@/lib/supabase-admin';

type CountRow = { denomination?: number; quantity?: number };

function rowsOf(value: unknown) {
  return Array.isArray(value) ? (value as CountRow[]) : [];
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'daily');
  if (denied) return denied;

  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const outletId = await verifiedOutletId(hotelId, payload.outlet_id);
  const businessDate = String(payload.business_date || '');
  const responsibleId = String(payload.responsible_profile_id || '');
  if (!canAccessHotel(auth.staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) return jsonError('Choose the business date.');
  if (!responsibleId) return jsonError('Choose the staff member responsible for this shift.');

  const { data: hotel } = await supabaseAdmin.from('hotels').select('rvf_float_amount').eq('id', hotelId).maybeSingle();
  let existingQuery = supabaseAdmin.from('day_closes').select('*').eq('hotel_id', hotelId).eq('business_date', businessDate);
  existingQuery = outletId ? existingQuery.eq('outlet_id', outletId) : existingQuery.is('outlet_id', null);
  const { data: existing } = await existingQuery.maybeSingle();
  if (existing?.status === 'locked') return jsonError('This day is locked. A manager has to unlock it first.', 409);

  let ledgerQuery = supabaseAdmin.from('ledger_entries').select('category, payment_method, is_collectible, amount').eq('hotel_id', hotelId).eq('entry_date', businessDate);
  ledgerQuery = outletId ? ledgerQuery.eq('outlet_id', outletId) : ledgerQuery.is('outlet_id', null);
  const { data: ledgerRaw } = await ledgerQuery;
  const figures = figuresFromLedger((ledgerRaw || []) as LedgerLike[], Number(hotel?.rvf_float_amount ?? 10000));
  const floatRows = rowsOf(payload.float_counts);
  const drawerRows = rowsOf(payload.drawer_counts);
  figures.floatCounted = countTotal(floatRows.map((row) => ({ denomination: Number(row.denomination || 0), quantity: Number(row.quantity || 0) })));
  figures.drawerCounted = countTotal(drawerRows.map((row) => ({ denomination: Number(row.denomination || 0), quantity: Number(row.quantity || 0) })));
  figures.bankDeposit = Number(payload.bank_deposit || 0);
  figures.returnToFund = Number(payload.return_to_fund ?? figures.expenses);
  const summary = summarizeClose(figures);
  if (summary.status !== 'balanced' && !String(payload.variance_note || '').trim()) {
    return jsonError('Write a note when the drawer is short or over.', 400);
  }

  const record = {
    hotel_id: hotelId,
    outlet_id: outletId,
    business_date: businessDate,
    responsible_profile_id: responsibleId,
    rvf_float: summary.rvfFloat,
    float_counted: summary.floatCounted,
    drawer_counted: summary.drawerCounted,
    bank_deposit: summary.bankDeposit,
    return_to_fund: summary.returnToFund,
    variance_amount: summary.variance,
    variance_status: summary.status,
    variance_note: String(payload.variance_note || '').trim() || null,
    prepared_by: auth.staff.userId,
    status: 'draft'
  };

  const saved = existing
    ? await supabaseAdmin.from('day_closes').update(record).eq('id', existing.id).select('*').single()
    : await supabaseAdmin.from('day_closes').insert(record).select('*').single();
  if (saved.error || !saved.data) return jsonError(saved.error?.message || 'Could not save the day.', 400);

  await supabaseAdmin.from('day_close_counts').delete().eq('day_close_id', saved.data.id);
  const countRows = [
    ...floatRows.map((row) => ({ day_close_id: saved.data.id, bucket: 'float', denomination: Number(row.denomination), quantity: Number(row.quantity || 0) })),
    ...drawerRows.map((row) => ({ day_close_id: saved.data.id, bucket: 'drawer', denomination: Number(row.denomination), quantity: Number(row.quantity || 0) }))
  ].filter((row) => row.denomination > 0);
  if (countRows.length) await supabaseAdmin.from('day_close_counts').insert(countRows);

  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    actor_id: auth.staff.userId,
    action: 'day_close.saved',
    details: { day_close_id: saved.data.id, status: summary.status, variance: summary.variance, responsible_profile_id: responsibleId }
  });

  return NextResponse.json({ day_close: saved.data, summary });
}
