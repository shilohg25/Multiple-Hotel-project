import { NextResponse } from 'next/server';
import { canAccessHotel } from '@/lib/auth';
import { businessDateForHotel } from '@/lib/business-date';
import { jsonError, requireApiStaff, denyUnless } from '@/lib/api';
import { lockedDayMessage, verifiedOutletId } from '@/lib/day-lock';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createLedgerEntryOnce, isServerOnlyLedgerRequestId, replaceLedgerEntryOnce, SERVER_ONLY_REQUEST_ID_ERROR } from '@/lib/ledger-idempotency';
import { parseLedgerPatchBody } from '@/lib/ledger-patch';
import { createSupabaseLedgerIdempotencyStore } from '@/lib/ledger-idempotency-store';

type Staff = Extract<Awaited<ReturnType<typeof requireApiStaff>>, { ok: true }>['staff'];

async function getEntry(id: string) {
  const { data } = await supabaseAdmin
    .from('ledger_entries')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

/** Same checks and insert as before for one entry: business date, outlet, day lock, amount, category. */
async function prepareLedgerInsert(staff: Staff, hotelId: string, payload: Record<string, unknown>) {
  const entryDate = await businessDateForHotel(hotelId, payload.entry_date as string | undefined);
  const amount = Number(payload.amount || 0);
  const outletId = await verifiedOutletId(hotelId, payload.outlet_id as string | undefined);
  const locked = await lockedDayMessage(hotelId, entryDate, outletId);
  if (locked) return { ok: false as const, error: locked, status: 409 };
  if (!Number.isFinite(amount)) return { ok: false as const, error: 'Amount must be a valid number.', status: 400 };
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

  return { ok: true as const, createEntry, amount, entryDate };
}

function thrownStatus(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status?: number }).status) : 400;
  return Number.isFinite(status) && status >= 400 ? status : 400;
}

export async function POST(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'daily');
  if (denied) return denied;
  const staff = auth.staff;
  const payload = await request.json();
  const hotelId = String(payload.hotel_id || '');
  const clientRequestId = String(payload.client_request_id || payload.offline_id || '').trim() || null;

  if (isServerOnlyLedgerRequestId(clientRequestId)) return jsonError(SERVER_ONLY_REQUEST_ID_ERROR, 400);
  if (!hotelId || !canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);

  const prepared = await prepareLedgerInsert(staff, hotelId, payload);
  if (!prepared.ok) return jsonError(prepared.error, prepared.status);

  let result;
  try {
    result = await createLedgerEntryOnce({
      userId: staff.userId,
      hotelId,
      clientRequestId,
      store: createSupabaseLedgerIdempotencyStore(),
      createEntry: prepared.createEntry,
      getEntry
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save ledger entry.';
    return jsonError(message, thrownStatus(error));
  }

  if (!result.ok) return jsonError(result.error, result.status);

  if (!result.duplicate) {
    await supabaseAdmin.from('audit_logs').insert({
      hotel_id: hotelId,
      actor_id: staff.userId,
      action: 'ledger.entry_created',
      details: { entry_id: result.entry.id, amount: prepared.amount, entry_date: prepared.entryDate }
    });
  }

  return NextResponse.json({ entry: result.entry, duplicate: result.duplicate });
}

/**
 * Replace a sheet entry that may not have saved, with one row per entry enforced here.
 * Body: { action: 'replace', hotel_id, client_request_id (the earlier entry), entry (the correction) }.
 * Order: 401 (signed out) -> 403 (role) -> 400 (malformed body) -> 403 (hotel) -> checks of the entry.
 * - Earlier entry already saved: nothing is inserted ('already_saved').
 * - Otherwise its id is retired (a late copy gets 410) and the correction is inserted under an id the
 *   server derives from the retired one, through #33's scoped unique reservation. A second tab or a
 *   retry gets the existing replacement back ('replacement_exists'), whatever amount it sent.
 * Ledger rows are never edited or deleted.
 */
export async function PATCH(request: Request) {
  const auth = await requireApiStaff();
  if (!auth.ok) return auth.response;
  const denied = denyUnless(auth.staff, 'daily');
  if (denied) return denied;
  const staff = auth.staff;
  const parsed = parseLedgerPatchBody(await request.text().catch(() => ''));
  if (!parsed.ok) return jsonError(parsed.error, parsed.status);
  const { hotelId, clientRequestId, entry } = parsed.body;
  if (!canAccessHotel(staff.profile, hotelId)) return jsonError('Hotel access denied.', 403);

  const prepared = await prepareLedgerInsert(staff, hotelId, { ...entry, hotel_id: hotelId });
  if (!prepared.ok) return jsonError(prepared.error, prepared.status);

  let result;
  try {
    result = await replaceLedgerEntryOnce({
      userId: staff.userId,
      hotelId,
      clientRequestId,
      store: createSupabaseLedgerIdempotencyStore(),
      createEntry: prepared.createEntry,
      getEntry
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to replace the entry.';
    return jsonError(message, thrownStatus(error));
  }

  if (result.status === 'denied') return jsonError('Hotel access denied.', 403);
  if (result.status === 'busy') return jsonError('The earlier entry is still being saved. Try again in a moment.', 409);
  if (result.status === 'error') return jsonError(result.error, result.httpStatus);

  const summary = { id: result.entry.id, amount: result.entry.amount };
  if (result.status === 'replaced') {
    await supabaseAdmin.from('audit_logs').insert({
      hotel_id: hotelId,
      actor_id: staff.userId,
      action: 'ledger.entry_replaced',
      details: { entry_id: result.entry.id, replaced_client_request_id: clientRequestId, amount: prepared.amount, entry_date: prepared.entryDate }
    });
  }
  return NextResponse.json({ status: result.status, entry: summary });
}
