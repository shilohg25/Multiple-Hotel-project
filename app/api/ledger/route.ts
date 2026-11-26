import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { businessDateForHotel } from '@/lib/business-date';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { lockedDayMessage, verifiedOutletId } from '@/lib/day-lock';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createLedgerEntryOnce, retireLedgerRequest } from '@/lib/ledger-idempotency';
import { createSupabaseLedgerIdempotencyStore } from '@/lib/ledger-idempotency-store';

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'daily');
  if (denied) return denied;
  const staff = auth.staff;
  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const clientRequestId = String(payload.client_request_id || payload.offline_id || '').trim() || null;

  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);

  const entryDate = await businessDateForHotel(hotelId, payload.entry_date);
  const amount = Number(payload.amount || 0);
  const outletId = await verifiedOutletId(hotelId, payload.outlet_id);
  const locked = await lockedDayMessage(hotelId, entryDate, outletId);
  if (locked) return jsonError(locked, 409);
  if (!Number.isFinite(amount)) return jsonError('Amount must be a valid number.');
  const category = String(payload.category || 'room');
  const collectible = category === 'collectible' || payload.is_collectible === true || payload.is_collectible === 'true';

  async function createEntry(id?: string) {
    const { data, error } = await supabaseAdmin
      .from('ledger_entries')
      .insert({
        ...(id ? { id } : {}),
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

    if (error) {
      const conflict = error.code === '23505'
        || String(error.message || '').toLowerCase().includes('duplicate')
        || String(error.message || '').toLowerCase().includes('unique');
      if (id && conflict) {
        const existing = await getEntry(id);
        if (existing) return existing;
      }
      const failure = new Error(error.message);
      (failure as Error & { status?: number }).status = 400;
      throw failure;
    }
    return data;
  }

  async function getEntry(id: string) {
    const { data } = await supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return data || null;
  }

  let result;
  try {
    result = await createLedgerEntryOnce({
      userId: staff.userId,
      hotelId,
      clientRequestId,
      store: createSupabaseLedgerIdempotencyStore(),
      createEntry,
      getEntry
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save ledger entry.';
    const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status?: number }).status) : 400;
    return jsonError(message, Number.isFinite(status) && status >= 400 ? status : 400);
  }

  if (!result.ok) return jsonError(result.error, result.status);

  if (!result.duplicate) {
    await supabaseAdmin.from('audit_logs').insert({
      hotel_id: hotelId,
      actor_id: staff.userId,
      action: 'ledger.entry_created',
      details: { entry_id: result.entry.id, amount, entry_date: entryDate }
    });
  }

  return NextResponse.json({ entry: result.entry, duplicate: result.duplicate });
}

/**
 * Replace a sheet entry that may not have saved. Body: { hotel_id, client_request_id, action: 'retire' }.
 * Scoped to the signed-in user and hotel (same scoped id as POST). Never inserts, edits or deletes
 * ledger rows: it either reports the earlier entry as already saved, or retires its id so a late copy
 * is refused, after which the client sends the corrected entry with a new id.
 */
export async function PATCH(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'daily');
  if (denied) return denied;
  const staff = auth.staff;
  const payload = await request.json().catch(() => ({}));
  const hotelId = String(payload.hotel_id || '');
  const clientRequestId = String(payload.client_request_id || '').trim();
  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);
  if (payload.action !== 'retire' || !clientRequestId) return jsonError('Send action "retire" with the earlier client_request_id.');

  const result = await retireLedgerRequest({
    userId: staff.userId,
    hotelId,
    clientRequestId,
    store: createSupabaseLedgerIdempotencyStore(),
    getEntry: async (id) => {
      const { data } = await supabaseAdmin.from('ledger_entries').select('id, hotel_id, created_by, amount, entry_date, category').eq('id', id).maybeSingle();
      return data || null;
    }
  });

  if (result.status === 'denied') return jsonError('Hotel access denied.', 403);
  if (result.status === 'busy') return jsonError('The earlier entry is still being saved. Try again in a moment.', 409);
  if (result.status === 'already_saved') {
    return NextResponse.json({ status: 'already_saved', entry: { id: result.entry.id, amount: result.entry.amount } });
  }
  await supabaseAdmin.from('audit_logs').insert({
    hotel_id: hotelId,
    actor_id: staff.userId,
    action: 'ledger.request_retired',
    details: { client_request_id: clientRequestId }
  });
  return NextResponse.json({ status: 'retired' });
}
