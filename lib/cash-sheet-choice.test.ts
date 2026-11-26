import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { replaceHeldSheetEntry, sendHeldSheetEntry, sheetEntryPayload, sheetHeldEntry, sheetWaitingCount, syncSheetQueue, saveSheetEntryWithQueue, fillSheetCopy } from './cash-sheet.ts';
import { startSheetAutoSend } from './sheet-auto-send.ts';
import { createMemoryStorage, readLedgerQueue, retryableLedgerEntries } from './ledger-entry-queue.ts';
import {
  createLedgerEntryOnce,
  createMemoryLedgerIdempotencyStore,
  retireLedgerRequest,
  LEDGER_REPLACED_ERROR,
  scopedLedgerRequestId,
  type LedgerEntryRecord
} from './ledger-idempotency.ts';

const USER = 'user-1';
const HOTEL = 'h1';
const ctx = { hotelId: HOTEL, businessDate: '2026-11-26', outletId: null };
const form = (amount: string) => sheetEntryPayload({ category: 'other', description: 'walk-in', amount, payment_method: 'cash' }, ctx);

/**
 * A fake /api/ledger: POST runs #33's createLedgerEntryOnce, PATCH runs retireLedgerRequest,
 * both on one memory dedupe store and one ledger table. `mode` decides what the network does.
 */
function fakeServer() {
  const store = createMemoryLedgerIdempotencyStore();
  const rows: LedgerEntryRecord[] = [];
  let seq = 0;
  const state = { mode: 'up' as 'up' | 'down' | 'stores-then-times-out', posts: 0 };
  const getEntry = async (id: string) => rows.find((row) => row.id === id) ?? null;

  async function handle(method: string, body: Record<string, unknown>) {
    if (method === 'PATCH') {
      const result = await retireLedgerRequest({ userId: USER, hotelId: String(body.hotel_id), clientRequestId: String(body.client_request_id), store, getEntry });
      if (result.status === 'busy') return { status: 409, json: { error: 'busy' } };
      if (result.status === 'denied') return { status: 403, json: { error: 'denied' } };
      if (result.status === 'already_saved') return { status: 200, json: { status: 'already_saved', entry: { id: result.entry.id, amount: result.entry.amount } } };
      return { status: 200, json: { status: 'retired' } };
    }
    const result = await createLedgerEntryOnce({
      userId: USER,
      hotelId: String(body.hotel_id),
      clientRequestId: String(body.client_request_id || '') || null,
      store,
      createEntry: async (id) => {
        const row = { id: id || `row-${++seq}`, hotel_id: String(body.hotel_id), created_by: USER, amount: Number(body.amount), client_request_id: body.client_request_id };
        rows.push(row);
        return row;
      },
      getEntry,
      sleep: async () => {}
    });
    if (!result.ok) return { status: result.status, json: { error: result.error } };
    return { status: 200, json: { entry: result.entry, duplicate: result.duplicate } };
  }

  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    if (state.mode === 'down') throw new TypeError('Failed to fetch');
    if (init?.method === 'POST') state.posts += 1;
    const answer = await handle(String(init?.method || 'GET'), JSON.parse(String(init?.body || '{}')));
    if (state.mode === 'stores-then-times-out') {
      // The server did the work; the answer never reaches the phone.
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); }, { once: true });
      });
    }
    return new Response(JSON.stringify(answer.json), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  return { store, rows, state, fetchImpl, handle };
}

const options = (storage: ReturnType<typeof createMemoryStorage>, fetchImpl: typeof fetch) =>
  ({ userId: USER, hotelId: HOTEL, outletId: null, storage, fetchImpl, timeoutMs: 20 });

async function queue650(server: ReturnType<typeof fakeServer>, storage: ReturnType<typeof createMemoryStorage>, mode: 'down' | 'stores-then-times-out') {
  server.state.mode = mode;
  const first = await saveSheetEntryWithQueue({ values: form('650'), previousPayload: null }, options(storage, server.fetchImpl));
  assert.equal(first.ok, false);
  server.state.mode = 'up';
  const [item] = retryableLedgerEntries(storage, USER);
  assert.equal(Number(item.payload.amount), 650);
  return item;
}

describe('option (a): an earlier entry did not save and the form now differs', () => {
  it('holds the queued entry while the form differs, and not when it matches or is empty', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'down');
    const queued = retryableLedgerEntries(storage, USER);
    assert.equal(sheetHeldEntry({ formValues: form('560'), queued, hotelId: HOTEL, outletId: null })?.clientRequestId, item.clientRequestId);
    assert.equal(sheetHeldEntry({ formValues: form('650'), queued, hotelId: HOTEL, outletId: null }), null);
    assert.equal(sheetHeldEntry({ formValues: { amount: '' }, queued, hotelId: HOTEL, outletId: null }), null);
    assert.equal(sheetHeldEntry({ formValues: form('560'), queued, hotelId: 'other-hotel', outletId: null }), null);
  });

  it('does not auto-send the held entry on load or online while they differ', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'down');
    const synced = await syncSheetQueue({ storage, userId: USER, skipIds: [item.clientRequestId], fetchImpl: server.fetchImpl, timeoutMs: 20 });
    assert.deepEqual(synced.synced, []);
    assert.equal(server.rows.length, 0);
    assert.equal(readLedgerQueue(storage, USER).length, 1, 'the 650 stays queued until staff choose');
  });

  it('auto-sends as before when nothing is held', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'down');
    const synced = await syncSheetQueue({ storage, userId: USER, fetchImpl: server.fetchImpl, timeoutMs: 20 });
    assert.deepEqual(synced.synced, [item.clientRequestId]);
    assert.deepEqual(server.rows.map((row) => row.amount), [650]);
  });

  it('650 -> edit to 560 -> Replace: exactly one 560 row', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'down');
    const outcome = await replaceHeldSheetEntry(item, form('560'), options(storage, server.fetchImpl));
    assert.equal(outcome.kind, 'sent');
    if (outcome.kind !== 'sent') return;
    assert.equal(outcome.result.ok, true);
    assert.notEqual(outcome.result.clientRequestId, item.clientRequestId, 'the 560 has a new id');
    assert.deepEqual(server.rows.map((row) => row.amount), [560]);
    assert.equal(readLedgerQueue(storage, USER).length, 0);
  });

  it('Replace when the 650 was in fact stored: one 650 row, nothing inserted, the adjustment message', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'stores-then-times-out');
    assert.deepEqual(server.rows.map((row) => row.amount), [650]);
    const outcome = await replaceHeldSheetEntry(item, form('560'), options(storage, server.fetchImpl));
    assert.deepEqual(outcome, { kind: 'already_saved', amount: 650 });
    assert.deepEqual(server.rows.map((row) => row.amount), [650]);
    assert.equal(readLedgerQueue(storage, USER).length, 0);
    assert.equal(
      fillSheetCopy('{old} was already saved. Correct it with an adjustment.', { old: '₱650.00' }),
      '₱650.00 was already saved. Correct it with an adjustment.'
    );
  });

  it('Send: one 650 row with the original id, also when the first try was stored', async () => {
    for (const mode of ['down', 'stores-then-times-out'] as const) {
      const server = fakeServer();
      const storage = createMemoryStorage();
      const item = await queue650(server, storage, mode);
      const result = await sendHeldSheetEntry(item, options(storage, server.fetchImpl));
      assert.equal(result.ok, true, mode);
      assert.equal(result.clientRequestId, item.clientRequestId, mode);
      assert.deepEqual(server.rows.map((row) => row.amount), [650], mode);
      assert.equal(readLedgerQueue(storage, USER).length, 0, mode);
    }
  });

  it('a late 650 after Replace is refused, and Replace is safe to press twice', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'down');
    const outcome = await replaceHeldSheetEntry(item, form('560'), options(storage, server.fetchImpl));
    assert.equal(outcome.kind, 'sent');
    // The old request arrives late (another tab, a slow proxy): refused, not stored.
    const late = await server.handle('POST', item.payload);
    assert.equal(late.status, 410);
    assert.equal((late.json as { error: string }).error, LEDGER_REPLACED_ERROR);
    // The same late copy through the device queue is refused and dropped, never retried.
    const lateStorage = createMemoryStorage();
    const lateResult = await sendHeldSheetEntry(item, options(lateStorage, server.fetchImpl));
    assert.equal(lateResult.ok, false);
    if (!lateResult.ok) assert.equal(lateResult.retryable, false);
    assert.equal(readLedgerQueue(lateStorage, USER).length, 0);
    const again = await server.handle('PATCH', { hotel_id: HOTEL, client_request_id: item.clientRequestId });
    assert.deepEqual(again.json, { status: 'retired' });
    assert.deepEqual(server.rows.map((row) => row.amount), [560]);
  });

  it('Replace while the 650 is still being saved: busy, nothing inserted, the choice stays', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'down');
    const scoped = scopedLedgerRequestId(USER, HOTEL, item.clientRequestId);
    assert.equal(await server.store.tryReserve({ clientRequestId: scoped, requestType: 'ledger_entry.create', createdBy: USER }), 'reserved');
    const outcome = await replaceHeldSheetEntry(item, form('560'), options(storage, server.fetchImpl));
    assert.equal(outcome.kind, 'busy');
    assert.equal(server.rows.length, 0);
    assert.equal(readLedgerQueue(storage, USER).length, 1, 'still queued so staff can choose again');
  });

  it('Replace while offline changes nothing', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'down');
    server.state.mode = 'down';
    const outcome = await replaceHeldSheetEntry(item, form('560'), options(storage, server.fetchImpl));
    assert.equal(outcome.kind, 'offline');
    server.state.mode = 'up';
    assert.equal(server.rows.length, 0);
    assert.equal(readLedgerQueue(storage, USER).length, 1);
  });
});

describe('retireLedgerRequest scope', () => {
  it('cannot retire or read another user\'s request, and a stale reservation without an entry is retired', async () => {
    const store = createMemoryLedgerIdempotencyStore();
    const scoped = scopedLedgerRequestId(USER, HOTEL, 'c1');
    await store.tryReserve({ clientRequestId: scoped, requestType: 'ledger_entry.create', createdBy: USER });
    const other = await retireLedgerRequest({ userId: 'user-2', hotelId: HOTEL, clientRequestId: 'c1', store, getEntry: async () => null });
    assert.equal(other.status, 'retired', 'user-2 gets its own scoped id; user-1\'s row is untouched');
    assert.equal((await store.get(scoped))?.status, 'reserved');
    const later = () => new Date(Date.now() + 10 * 60_000);
    const stale = await retireLedgerRequest({ userId: USER, hotelId: HOTEL, clientRequestId: 'c1', store, getEntry: async () => null, now: later });
    assert.equal(stale.status, 'retired');
    assert.equal((await store.get(scoped))?.status, 'retired');
  });
});

describe('auto-send after reconnecting (Tester: an unchanged queued entry only sent on reload)', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

  /** The page: a window and document that can fire events, manual timers, and the same pass CashSheetEntries runs. */
  function page(server: ReturnType<typeof fakeServer>, storage: ReturnType<typeof createMemoryStorage>, formAmount = '') {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const timers: Array<() => void> = [];
    const run = async () => {
      const formValues = formAmount ? form(formAmount) : { amount: '' };
      const held = sheetHeldEntry({ formValues, queued: retryableLedgerEntries(storage, USER), hotelId: HOTEL, outletId: null });
      const skipIds = held ? retryableLedgerEntries(storage, USER).map((item) => item.clientRequestId) : [];
      await syncSheetQueue({ storage, userId: USER, skipIds, fetchImpl: server.fetchImpl, timeoutMs: 20, resetStale: false });
      return { remaining: sheetWaitingCount(readLedgerQueue(storage, USER), skipIds) };
    };
    const sender = startSheetAutoSend({
      win,
      doc,
      run,
      setTimer: (callback) => { timers.push(callback); return timers.length; },
      clearTimer: () => { timers.length = 0; }
    });
    return { win, doc, timers, sender };
  }

  it("fires window 'online' and sends the unchanged queued entry exactly once", async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'down');
    server.state.mode = 'down';
    const p = page(server, storage);
    await settle();
    assert.equal(server.state.posts, 0, 'still offline on load: nothing reached the server');
    server.state.mode = 'up';
    p.win.dispatchEvent(new Event('online'));
    p.win.dispatchEvent(new Event('online'));
    await settle();
    assert.equal(server.state.posts, 1, 'one send, even with two online events');
    assert.deepEqual(server.rows.map((row) => [row.amount, row.client_request_id]), [[650, item.clientRequestId]]);
    assert.equal(readLedgerQueue(storage, USER).length, 0);
    p.win.dispatchEvent(new Event('online'));
    await settle();
    assert.equal(server.state.posts, 1, 'nothing left to send');
    p.sender.stop();
  });

  it('sends without any online event (navigator.onLine never changed: DevTools Offline, Wi-Fi without internet)', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    await queue650(server, storage, 'down');
    server.state.mode = 'down';
    const p = page(server, storage);
    await settle();
    assert.equal(p.timers.length, 1, 'a retry is armed while the entry waits');
    server.state.mode = 'up';
    p.timers.shift()!();
    await settle();
    assert.equal(server.state.posts, 1);
    assert.deepEqual(server.rows.map((row) => row.amount), [650]);
    assert.equal(p.timers.length, 0, 'nothing waiting, no timer');
    p.sender.stop();
  });

  it('sends when the tab becomes visible again', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    await queue650(server, storage, 'down');
    server.state.mode = 'down';
    const p = page(server, storage);
    await settle();
    server.state.mode = 'up';
    p.doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    assert.deepEqual(server.rows.map((row) => row.amount), [650]);
    p.sender.stop();
  });

  it("an edited form still holds: 'online' sends nothing and no retry timer runs", async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    await queue650(server, storage, 'down');
    const p = page(server, storage, '560');
    await settle();
    p.win.dispatchEvent(new Event('online'));
    p.doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    assert.equal(server.state.posts, 0);
    assert.equal(p.timers.length, 0);
    assert.equal(readLedgerQueue(storage, USER).length, 1);
    p.sender.stop();
  });

  it('stop() removes the listeners', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    await queue650(server, storage, 'down');
    server.state.mode = 'down';
    const p = page(server, storage);
    await settle();
    p.sender.stop();
    server.state.mode = 'up';
    p.win.dispatchEvent(new Event('online'));
    await settle();
    assert.equal(server.state.posts, 0);
  });
});
