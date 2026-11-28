import { readFileSync } from 'node:fs';
import { createSheetTabIdentity, type SheetTabChannel } from './sheet-tab-id.ts';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { replaceHeldSheetEntry, restoreSheetLink, sendHeldSheetEntry, sheetEntryPayload, sheetEntryStillQueued, sheetLinkKey, sheetQueueState, sheetSourceGone, writeSheetLink, restoreSheetLinkState, readSheetSentElsewhere, writeSheetSentElsewhere, sheetSentElsewhereKey, sheetSaveBlocked, sheetRetryAvailable, sheetInFlightOutcome, markSentByThisTab, nextSheetHeldExpiry, holdSheetEntryOnLoad, rekeySheetHeldMark, sheetPendingChoiceId, SHEET_HELD_RELEASE_DEBOUNCE_MS, watchSheetHeldMarks, sheetHeldMarkKey, wasSentByThisTab, sheetAutoSendSkips, writeSheetHeldMark, clearSheetHeldMarks, sheetHeldElsewhere, withSheetSaving, SHEET_HELD_MARK_TTL_MS, sheetFormStillSent, sheetHeldEntry, sheetWaitingCount, syncSheetQueue, saveSheetEntryWithQueue, fillSheetCopy } from './cash-sheet.ts';
import { createSheetBusyGate, startSheetAutoSend, watchSheetSource } from './sheet-auto-send.ts';
import { parseLedgerPatchBody } from './ledger-patch.ts';
import { createMemoryStorage, ledgerQueueStorageKey, readLedgerQueue, retryableLedgerEntries, upsertLedgerQueueItem } from './ledger-entry-queue.ts';
import {
  createLedgerEntryOnce,
  createMemoryLedgerIdempotencyStore,
  isServerOnlyLedgerRequestId,
  replaceLedgerEntryOnce,
  SERVER_ONLY_REQUEST_ID_ERROR,
  replacementClientRequestId,
  retireLedgerRequest,
  LEDGER_REPLACED_ERROR,
  scopedLedgerRequestId,
  type LedgerEntryRecord
} from './ledger-idempotency.ts';

const USER = 'user-1';
const HOTEL = 'd0000000-0000-4000-8000-000000000001';
const ctx = { hotelId: HOTEL, businessDate: '2026-11-26', outletId: null };
const form = (amount: string) => sheetEntryPayload({ category: 'other', description: 'walk-in', amount, payment_method: 'cash' }, ctx);

/**
 * A fake /api/ledger: POST runs #33's createLedgerEntryOnce, PATCH parses like the route and runs replaceLedgerEntryOnce,
 * both on one memory dedupe store and one ledger table. `mode` decides what the network does.
 */
function fakeServer() {
  const store = createMemoryLedgerIdempotencyStore();
  const rows: LedgerEntryRecord[] = [];
  let seq = 0;
  const state = { mode: 'up' as 'up' | 'down' | 'stores-then-times-out', posts: 0, patches: 0 };
  const getEntry = async (id: string) => rows.find((row) => row.id === id) ?? null;

  const creator = (hotelId: string, entry: Record<string, unknown>, tag: unknown) => async (id?: string) => {
    const row = { id: id || `row-${++seq}`, hotel_id: hotelId, created_by: USER, amount: Number(entry.amount), client_request_id: tag };
    rows.push(row);
    return row;
  };

  async function handle(method: string, body: Record<string, unknown>) {
    if (method === 'PATCH') {
      const parsed = parseLedgerPatchBody(JSON.stringify(body));
      if (!parsed.ok) return { status: 400, json: { error: parsed.error } };
      const { hotelId, clientRequestId, entry } = parsed.body;
      const result = await replaceLedgerEntryOnce({
        userId: USER,
        hotelId,
        clientRequestId,
        store,
        createEntry: creator(hotelId, entry, replacementClientRequestId(clientRequestId)),
        getEntry,
        sleep: async () => {}
      });
      if (result.status === 'busy') return { status: 409, json: { error: 'busy' } };
      if (result.status === 'denied') return { status: 403, json: { error: 'denied' } };
      if (result.status === 'error') return { status: result.httpStatus, json: { error: result.error } };
      return { status: 200, json: { status: result.status, entry: { id: result.entry.id, amount: result.entry.amount } } };
    }
    const result = await createLedgerEntryOnce({
      userId: USER,
      hotelId: String(body.hotel_id),
      clientRequestId: String(body.client_request_id || '') || null,
      store,
      createEntry: creator(String(body.hotel_id), body, body.client_request_id),
      getEntry,
      sleep: async () => {}
    });
    if (!result.ok) return { status: result.status, json: { error: result.error } };
    return { status: 200, json: { entry: result.entry, duplicate: result.duplicate } };
  }

  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    if (state.mode === 'down') throw new TypeError('Failed to fetch');
    if (init?.method === 'POST') state.posts += 1;
    if (init?.method === 'PATCH') state.patches += 1;
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
    const sourceId = item.clientRequestId;
    assert.equal(sheetHeldEntry({ formValues: form('560'), queued, hotelId: HOTEL, outletId: null, sourceId })?.clientRequestId, item.clientRequestId);
    assert.equal(sheetHeldEntry({ formValues: form('650'), queued, hotelId: HOTEL, outletId: null, sourceId }), null);
    assert.equal(sheetHeldEntry({ formValues: { amount: '' }, queued, hotelId: HOTEL, outletId: null, sourceId }), null);
    assert.equal(sheetHeldEntry({ formValues: form('560'), queued, hotelId: 'other-hotel', outletId: null, sourceId }), null);
    assert.equal(sheetHeldEntry({ formValues: form('560'), queued, hotelId: HOTEL, outletId: null, sourceId: null }), null, 'a form that did not come from a queued entry is a new entry');
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
    assert.deepEqual(outcome, { kind: 'replaced', amount: 560 });
    assert.deepEqual(server.rows.map((row) => [row.amount, row.client_request_id]), [[560, `${item.clientRequestId}:replace`]], 'the server picked the replacement id');
    assert.equal(server.state.posts, 0, 'one PATCH, no separate POST');
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
    assert.equal(outcome.kind, 'replaced');
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
    const again = await server.handle('PATCH', { action: 'replace', hotel_id: HOTEL, client_request_id: item.clientRequestId, entry: { amount: 560 } });
    assert.equal((again.json as { status: string }).status, 'replacement_exists');
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
      const queued = retryableLedgerEntries(storage, USER);
      const held = sheetHeldEntry({ formValues, queued, hotelId: HOTEL, outletId: null, sourceId: queued[0]?.clientRequestId });
      const skipIds = held ? [held.clientRequestId] : [];
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

describe('PR #35 82551cb follow-ups', () => {
  it('item 1: Replace in two tabs, same amount, different amount, and at the same time: exactly 1 row', async () => {
    for (const second of ['560', '570']) {
      const server = fakeServer();
      const tabA = createMemoryStorage();
      const item = await queue650(server, tabA, 'down');
      // Tab B has its own copy of the queued entry (worst case: the client-side check cannot help).
      const tabB = createMemoryStorage({ [`hotel_ops_ledger_entry_queue:${USER}`]: tabA.getItem(`hotel_ops_ledger_entry_queue:${USER}`)! });
      const first = await replaceHeldSheetEntry(item, form('560'), options(tabA, server.fetchImpl));
      const other = await replaceHeldSheetEntry(item, form(second), options(tabB, server.fetchImpl));
      assert.deepEqual(first, { kind: 'replaced', amount: 560 }, second);
      assert.deepEqual(other, { kind: 'replacement_exists', amount: 560 }, `second tab typed ${second}: gets the existing 560 back`);
      assert.deepEqual(server.rows.map((row) => row.amount), [560], second);
    }
    assert.equal(
      fillSheetCopy('{amount} was already saved as the replacement. Correct it with an adjustment.', { amount: '₱560.00' }),
      '₱560.00 was already saved as the replacement. Correct it with an adjustment.'
    );

    const server = fakeServer();
    const tabA = createMemoryStorage();
    const item = await queue650(server, tabA, 'down');
    const tabB = createMemoryStorage({ [`hotel_ops_ledger_entry_queue:${USER}`]: tabA.getItem(`hotel_ops_ledger_entry_queue:${USER}`)! });
    const both = await Promise.all([
      replaceHeldSheetEntry(item, form('560'), options(tabA, server.fetchImpl)),
      replaceHeldSheetEntry(item, form('570'), options(tabB, server.fetchImpl))
    ]);
    assert.equal(server.rows.length, 1, `at the same time: ${JSON.stringify(both)}`);
  });

  it('item 1: the client reads the device queue again and sends nothing when the entry is gone', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'down');
    assert.equal((await replaceHeldSheetEntry(item, form('560'), options(storage, server.fetchImpl))).kind, 'replaced');
    assert.equal(sheetEntryStillQueued(storage, USER, item.clientRequestId), false);
    const patches = server.state.patches;
    assert.deepEqual(await replaceHeldSheetEntry(item, form('570'), options(storage, server.fetchImpl)), { kind: 'gone' });
    assert.equal(server.state.patches, patches, 'no request');
    assert.deepEqual(server.rows.map((row) => row.amount), [560]);
  });

  it('item 2: only the entry the form came from is held; other queued entries auto-send and a new entry saves', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    server.state.mode = 'down';
    const other = await saveSheetEntryWithQueue({ values: sheetEntryPayload({ category: 'expense', description: 'ice', amount: '120', payment_method: 'cash' }, ctx), previousPayload: null }, options(storage, server.fetchImpl));
    const source = await saveSheetEntryWithQueue({ values: form('650'), previousPayload: null }, options(storage, server.fetchImpl));
    server.state.mode = 'up';
    const queued = retryableLedgerEntries(storage, USER);
    const held = sheetHeldEntry({ formValues: form('560'), queued, hotelId: HOTEL, outletId: null, sourceId: source.clientRequestId });
    assert.equal(held?.clientRequestId, source.clientRequestId, 'the form came from the 650');
    const synced = await syncSheetQueue({ storage, userId: USER, skipIds: [held!.clientRequestId], fetchImpl: server.fetchImpl, timeoutMs: 20 });
    assert.deepEqual(synced.synced, [other.clientRequestId], 'the other queued entry was not blocked');
    // A new, different entry (no source link) is not held and saves while the 650 still waits.
    assert.equal(sheetHeldEntry({ formValues: form('75'), queued: retryableLedgerEntries(storage, USER), hotelId: HOTEL, outletId: null, sourceId: null }), null);
    const fresh = await saveSheetEntryWithQueue({ values: form('75'), previousPayload: null }, options(storage, server.fetchImpl));
    assert.equal(fresh.ok, true);
    assert.deepEqual(server.rows.map((row) => row.amount).sort((a, b) => Number(a) - Number(b)), [75, 120]);
    assert.deepEqual(readLedgerQueue(storage, USER).map((item) => item.clientRequestId), [source.clientRequestId], 'only the 650 waits for the choice');
  });

  it('item 3: an edit typed while a matching entry auto-sends is kept', async () => {
    const server = fakeServer();
    const storage = createMemoryStorage();
    const item = await queue650(server, storage, 'down');
    let onScreen = form('650');
    const slow = (async (url: string, init?: RequestInit) => {
      onScreen = form('655'); // staff type while the send is in flight
      return server.fetchImpl(url, init);
    }) as typeof fetch;
    const synced = await syncSheetQueue({ storage, userId: USER, fetchImpl: slow, timeoutMs: 50 });
    assert.deepEqual(synced.synced, [item.clientRequestId]);
    assert.equal(sheetFormStillSent(onScreen, item.payload, { outletId: null, hotelId: HOTEL }), false, 'the 655 edit is not cleared');
    assert.equal(sheetFormStillSent(form('650'), item.payload, { outletId: null, hotelId: HOTEL }), true, 'an untouched form is cleared');
  });

  it('item 4: PATCH body is validated before the hotel check: bad JSON or a missing/invalid hotel_id is 400', () => {
    const bad = ['{not json', '', 'null', '[]', JSON.stringify({ action: 'replace', client_request_id: 'c', entry: {} }),
      JSON.stringify({ action: 'replace', hotel_id: 'h1', client_request_id: 'c', entry: {} }),
      JSON.stringify({ action: 'replace', hotel_id: 42, client_request_id: 'c', entry: {} }),
      JSON.stringify({ action: 'retire', hotel_id: HOTEL, client_request_id: 'c', entry: {} }),
      JSON.stringify({ action: 'replace', hotel_id: HOTEL, entry: {} }),
      JSON.stringify({ action: 'replace', hotel_id: HOTEL, client_request_id: 'c' })];
    for (const text of bad) {
      const parsed = parseLedgerPatchBody(text);
      assert.equal(parsed.ok, false, text);
      if (!parsed.ok) assert.equal(parsed.status, 400, text);
    }
    const good = parseLedgerPatchBody(JSON.stringify({ action: 'replace', hotel_id: HOTEL, client_request_id: 'c1', entry: { amount: 560 } }));
    assert.equal(good.ok, true);
  });
});

describe('PR #35 8ee58b4 follow-ups', () => {
  it('item 1: the link survives a reload in sessionStorage; a refilled 560 is held, not auto-sent', async () => {
    const server = fakeServer();
    const queue = createMemoryStorage(); // localStorage, shared by tabs
    const session = createMemoryStorage(); // this tab's sessionStorage, survives reload and back/forward
    const item = await queue650(server, queue, 'down');
    writeSheetLink(session, USER, HOTEL, { clientRequestId: item.clientRequestId, values: form('650') });

    // Reload: memory is gone, the browser refilled 560.
    const link = restoreSheetLink(session, queue, USER, HOTEL);
    assert.equal(link?.clientRequestId, item.clientRequestId);
    assert.equal(Number(link?.values.amount), 650, 'snapshot of what was sent');
    const held = sheetHeldEntry({ formValues: form('560'), queued: retryableLedgerEntries(queue, USER), hotelId: HOTEL, outletId: null, sourceId: link?.clientRequestId });
    assert.equal(held?.clientRequestId, item.clientRequestId);
    const synced = await syncSheetQueue({ storage: queue, userId: USER, skipIds: [held!.clientRequestId], fetchImpl: server.fetchImpl, timeoutMs: 20 });
    assert.deepEqual(synced.synced, []);
    assert.equal(server.state.posts, 0, 'no auto-send while the restored form differs');

    // Another user or hotel never sees this link.
    assert.equal(restoreSheetLink(session, queue, 'user-2', HOTEL), null);
    assert.equal(restoreSheetLink(session, queue, USER, 'd0000000-0000-4000-8000-000000000002'), null);

    // Once the entry leaves the queue, the link is dropped on the next load.
    await sendHeldSheetEntry(item, options(queue, server.fetchImpl));
    assert.equal(restoreSheetLink(session, queue, USER, HOTEL), null);
    assert.equal(session.getItem(sheetLinkKey(USER, HOTEL)), null);
    writeSheetLink(session, USER, HOTEL, { clientRequestId: 'x', values: {} });
    writeSheetLink(session, USER, HOTEL, null);
    assert.equal(session.getItem(sheetLinkKey(USER, HOTEL)), null, 'clearing the link removes it');
  });

  it('item 2: POST refuses a client_request_id ending in ":replace"; only PATCH replace builds those', async () => {
    assert.equal(isServerOnlyLedgerRequestId('abc:replace'), true);
    assert.equal(isServerOnlyLedgerRequestId('abc'), false);
    assert.equal(isServerOnlyLedgerRequestId(null), false);
    const server = fakeServer();
    const item = await queue650(server, createMemoryStorage(), 'down');
    const posted = await server.handle('POST', { ...item.payload, client_request_id: `${item.clientRequestId}:replace`, amount: 999 });
    assert.equal(posted.status, 400);
    assert.equal((posted.json as { error: string }).error, SERVER_ONLY_REQUEST_ID_ERROR);
    assert.equal(server.rows.length, 0);
    const patched = await server.handle('PATCH', { action: 'replace', hotel_id: HOTEL, client_request_id: `${item.clientRequestId}:replace`, entry: { amount: 1 } });
    assert.equal(patched.status, 400, 'a replacement cannot be replaced again');
    // The server-built replacement still works.
    const replaced = await server.handle('PATCH', { action: 'replace', hotel_id: HOTEL, client_request_id: item.clientRequestId, entry: { amount: 560 } });
    assert.equal((replaced.json as { status: string }).status, 'replaced');
    assert.deepEqual(server.rows.map((row) => row.amount), [560]);
  });

  it('item 3: Replace while another tab is sending the entry: no request, choice and queue kept, then resolves', async () => {
    const server = fakeServer();
    const queue = createMemoryStorage();
    const item = await queue650(server, queue, 'down');
    // The other tab marks it 'syncing' in the shared queue while its request is in flight.
    upsertLedgerQueueItem(queue, USER, { ...readLedgerQueue(queue, USER)[0], status: 'syncing' });
    assert.equal(sheetQueueState(queue, USER, item.clientRequestId), 'sending');
    assert.deepEqual(await replaceHeldSheetEntry(item, form('560'), options(queue, server.fetchImpl)), { kind: 'in_flight' });
    assert.equal(server.state.patches, 0);
    assert.equal(readLedgerQueue(queue, USER).length, 1, 'nothing removed');
    assert.equal(sheetEntryStillQueued(queue, USER, item.clientRequestId), false);

    // Final state A: the other tab's send failed, the entry is back in the queue: Replace works.
    upsertLedgerQueueItem(queue, USER, { ...readLedgerQueue(queue, USER)[0], status: 'failed' });
    assert.equal(sheetQueueState(queue, USER, item.clientRequestId), 'queued');
    assert.deepEqual(await replaceHeldSheetEntry(item, form('560'), options(queue, server.fetchImpl)), { kind: 'replaced', amount: 560 });

    // Final state B: the other tab's send finished (entry gone): resolved as handled elsewhere, nothing sent.
    const server2 = fakeServer();
    const queue2 = createMemoryStorage();
    const item2 = await queue650(server2, queue2, 'down');
    upsertLedgerQueueItem(queue2, USER, { ...readLedgerQueue(queue2, USER)[0], status: 'syncing' });
    assert.equal((await replaceHeldSheetEntry(item2, form('560'), options(queue2, server2.fetchImpl))).kind, 'in_flight');
    await sendHeldSheetEntry({ ...item2, status: 'pending' }, options(queue2, server2.fetchImpl)); // the other tab completes
    assert.equal(sheetQueueState(queue2, USER, item2.clientRequestId), 'gone');
    assert.deepEqual(await replaceHeldSheetEntry(item2, form('560'), options(queue2, server2.fetchImpl)), { kind: 'gone' });
    assert.deepEqual(server2.rows.map((row) => row.amount), [650]);
  });
});

describe('Tester case D: another tab sends the entry this form came from', () => {
  const storageEvent = (key: string | null) => Object.assign(new Event('storage'), { key });

  it('tab 1 learns from the storage event: note, link dropped, no automatic second row', async () => {
    const server = fakeServer();
    const shared = createMemoryStorage(); // localStorage: both tabs
    const session1 = createMemoryStorage(); // tab 1 sessionStorage
    // Tab 1 saves 850 offline (queued) and links its form to it, then edits the form to 860.
    server.state.mode = 'down';
    const saved = await saveSheetEntryWithQueue({ values: form('850'), previousPayload: null }, options(shared, server.fetchImpl));
    server.state.mode = 'up';
    const link = { clientRequestId: saved.clientRequestId, values: form('850') };
    writeSheetLink(session1, USER, HOTEL, link);
    const tab1Form = form('860');

    // Tab 1 listens like CashSheetEntries does.
    const win1 = new EventTarget();
    const notes: Array<ReturnType<typeof sheetSourceGone>> = [];
    let tab1Link: typeof link | null = link;
    const stop = watchSheetSource({
      win: win1,
      keys: [ledgerQueueStorageKey(USER), sheetLinkKey(USER, HOTEL)],
      check: () => {
        const gone = sheetSourceGone({ storage: shared, userId: USER, hotelId: HOTEL, outletId: null, link: tab1Link, formValues: tab1Form });
        if (!gone) return;
        notes.push(gone);
        tab1Link = null;
        writeSheetLink(session1, USER, HOTEL, null);
      }
    });

    // Tab 2 (empty form, nothing held) marks it syncing: tab 1 hears it, but it is not gone yet.
    upsertLedgerQueueItem(shared, USER, { ...readLedgerQueue(shared, USER)[0], status: 'syncing' });
    win1.dispatchEvent(storageEvent(ledgerQueueStorageKey(USER)));
    assert.equal(notes.length, 0, 'mid-send: the in-flight path applies, no note yet');
    upsertLedgerQueueItem(shared, USER, { ...readLedgerQueue(shared, USER)[0], status: 'pending' });

    // Tab 2 auto-sends the 850.
    const tab2 = await syncSheetQueue({ storage: shared, userId: USER, fetchImpl: server.fetchImpl, timeoutMs: 20 });
    assert.deepEqual(tab2.synced, [saved.clientRequestId]);
    win1.dispatchEvent(storageEvent('some-other-key'));
    assert.equal(notes.length, 0, 'unrelated keys are ignored');
    win1.dispatchEvent(storageEvent(ledgerQueueStorageKey(USER)));

    assert.deepEqual(notes, [{ kind: 'edited', oldAmount: 850, newAmount: '860', byThisTab: false }]);
    assert.equal(
      fillSheetCopy('{old} was already sent from another tab. Your edit {new} was not saved. Correct it with an adjustment if needed.', { old: '₱850.00', new: '₱860.00' }),
      '₱850.00 was already sent from another tab. Your edit ₱860.00 was not saved. Correct it with an adjustment if needed.'
    );
    assert.equal(session1.getItem(sheetLinkKey(USER, HOTEL)), null, 'link dropped');
    assert.equal(restoreSheetLink(session1, shared, USER, HOTEL), null);

    // Nothing in tab 1 creates a second row by itself: no hold, nothing queued, an auto pass sends nothing.
    assert.equal(sheetHeldEntry({ formValues: tab1Form, queued: retryableLedgerEntries(shared, USER), hotelId: HOTEL, outletId: null, sourceId: tab1Link?.clientRequestId ?? null }), null);
    const tab1Pass = await syncSheetQueue({ storage: shared, userId: USER, fetchImpl: server.fetchImpl, timeoutMs: 20 });
    assert.deepEqual(tab1Pass.synced, []);
    assert.deepEqual(server.rows.map((row) => row.amount), [850]);

    // Only an explicit "Save ₱860.00 as a new entry" makes a second row, with a new id.
    const confirmed = await saveSheetEntryWithQueue({ values: tab1Form, previousPayload: null }, options(shared, server.fetchImpl));
    assert.equal(confirmed.ok, true);
    assert.notEqual(confirmed.clientRequestId, saved.clientRequestId);
    assert.deepEqual(server.rows.map((row) => row.amount), [850, 860]);
    stop();
  });

  it('an unchanged form is reported as sent elsewhere; online, focus, visibility and a cleared storage re-check', () => {
    const shared = createMemoryStorage();
    const link = { clientRequestId: 'gone-id', values: form('850') };
    assert.deepEqual(sheetSourceGone({ storage: shared, userId: USER, hotelId: HOTEL, link, formValues: form('850') }), { kind: 'unchanged', oldAmount: 850, newAmount: '850', byThisTab: false });
    assert.deepEqual(sheetSourceGone({ storage: shared, userId: USER, hotelId: HOTEL, link, formValues: { amount: '' } })?.kind, 'unchanged');
    assert.equal(sheetSourceGone({ storage: shared, userId: USER, hotelId: HOTEL, link: null, formValues: form('860') }), null);

    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const reasons: string[] = [];
    const stop = watchSheetSource({ win, doc, keys: [ledgerQueueStorageKey(USER)], check: (reason) => reasons.push(reason) });
    win.dispatchEvent(new Event('online'));
    win.dispatchEvent(new Event('focus'));
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(storageEvent(null));
    assert.deepEqual(reasons, ['online', 'focus', 'visible', 'storage']);
    stop();
    win.dispatchEvent(new Event('online'));
    assert.equal(reasons.length, 4, 'stop() removes the listeners');
  });
});

describe('PR #35 0b9e48f NO-GO fixes', () => {
  async function sentByOtherTab() {
    const server = fakeServer();
    const shared = createMemoryStorage();
    const session1 = createMemoryStorage();
    server.state.mode = 'down';
    const saved = await saveSheetEntryWithQueue({ values: form('850'), previousPayload: null }, options(shared, server.fetchImpl));
    server.state.mode = 'up';
    writeSheetLink(session1, USER, HOTEL, { clientRequestId: saved.clientRequestId, values: form('850') });
    await syncSheetQueue({ storage: shared, userId: USER, fetchImpl: server.fetchImpl, timeoutMs: 20 }); // tab 2 sends it
    return { server, shared, session1, saved };
  }

  it('1. remount with a stale link and a refilled 860: the gate shows and a plain Save is blocked', async () => {
    const { server, shared, session1 } = await sentByOtherTab();
    // Tab 1 reloads (memory gone). The browser refills 860.
    const state = restoreSheetLinkState(session1, shared, USER, HOTEL);
    assert.equal(state.link, null);
    assert.equal(Number(state.goneLink?.values.amount), 850, 'the stale link is returned for the comparison, not dropped silently');
    assert.equal(session1.getItem(sheetLinkKey(USER, HOTEL)), null);
    const gone = sheetSourceGone({ storage: shared, userId: USER, hotelId: HOTEL, link: state.goneLink, formValues: form('860') });
    assert.deepEqual(gone, { kind: 'edited', oldAmount: 850, newAmount: '860', byThisTab: false });
    writeSheetSentElsewhere(session1, USER, HOTEL, { mode: 'gate', oldAmount: 850, values: state.goneLink!.values });
    // The note survives another reload until dismissed.
    const note = readSheetSentElsewhere(session1, USER, HOTEL);
    assert.equal(note?.mode, 'gate');
    assert.equal(sheetSaveBlocked(note, form('860'), false), true, 'plain Save shows the gate');
    assert.equal(sheetSaveBlocked(note, form('860'), true), false, '"Save as a new entry" is allowed');
    assert.deepEqual(server.rows.map((row) => row.amount), [850], 'no silent second row');
    writeSheetSentElsewhere(session1, USER, HOTEL, null);
    assert.equal(session1.getItem(sheetSentElsewhereKey(USER, HOTEL)), null, 'dismissed');
  });

  it('1. remount with an empty form: "already sent" note, and a later refill + Save still gets the gate', async () => {
    const { shared, session1 } = await sentByOtherTab();
    const state = restoreSheetLinkState(session1, shared, USER, HOTEL);
    const gone = sheetSourceGone({ storage: shared, userId: USER, hotelId: HOTEL, link: state.goneLink, formValues: { amount: '' } });
    assert.equal(gone?.kind, 'unchanged');
    writeSheetSentElsewhere(session1, USER, HOTEL, { mode: 'armed', oldAmount: 850, values: state.goneLink!.values });
    const note = readSheetSentElsewhere(session1, USER, HOTEL);
    assert.equal(sheetSaveBlocked(note, { amount: '' }, false), false);
    assert.equal(sheetSaveBlocked(note, form('860'), false), true, 'refilled without typing: gate');
    assert.equal(sheetSaveBlocked(null, form('860'), false), false, 'after staff type (note cleared) it is a normal new entry');
  });

  it('2. a re-check asked for during this tab\'s own send runs once when the send ends', () => {
    const gate = createSheetBusyGate();
    let checks = 0;
    const check = () => { checks += 1; };
    gate.whenIdle(check);
    assert.equal(checks, 1, 'idle: runs at once');
    gate.start();
    gate.whenIdle(check);
    gate.whenIdle(check);
    assert.equal(checks, 1, 'busy: waits');
    gate.end();
    assert.equal(checks, 2, 'once when the send ends');
    gate.end();
    assert.equal(checks, 2);
  });

  it('3. Replace finds the held entry gone (another tab sent it): treated as an edited gone, not cleared', async () => {
    const server = fakeServer();
    const shared = createMemoryStorage();
    const item = await queue650(server, shared, 'down');
    await syncSheetQueue({ storage: shared, userId: USER, fetchImpl: server.fetchImpl, timeoutMs: 20 }); // other tab
    assert.deepEqual(await replaceHeldSheetEntry(item, form('560'), options(shared, server.fetchImpl)), { kind: 'gone' });
    const gone = sheetSourceGone({ storage: shared, userId: USER, hotelId: HOTEL, link: { clientRequestId: item.clientRequestId, values: item.payload }, formValues: form('560') });
    assert.deepEqual(gone, { kind: 'edited', oldAmount: 650, newAmount: '560', byThisTab: false }, 'same gate as a live gone: keep 560, offer "Save as a new entry"');
    assert.deepEqual(server.rows.map((row) => row.amount), [650]);
  });

  it('4. Retry is shown only while its entry is still queued and no gate or choice is up', async () => {
    const server = fakeServer();
    const shared = createMemoryStorage();
    const item = await queue650(server, shared, 'down');
    const base = { storage: shared, userId: USER, pendingId: item.clientRequestId, held: false, gate: false };
    assert.equal(sheetRetryAvailable(base), true);
    assert.equal(sheetRetryAvailable({ ...base, held: true }), false);
    assert.equal(sheetRetryAvailable({ ...base, gate: true }), false);
    assert.equal(sheetRetryAvailable({ ...base, pendingId: null }), false);
    await syncSheetQueue({ storage: shared, userId: USER, fetchImpl: server.fetchImpl, timeoutMs: 20 });
    assert.equal(sheetRetryAvailable(base), false, 'sent elsewhere: nothing to retry');
  });

  it('5. after ~60 s of "being sent from another tab", show the reload hint', () => {
    assert.equal(sheetInFlightOutcome('sending', 1), 'wait');
    assert.equal(sheetInFlightOutcome('sending', 39), 'wait');
    assert.equal(sheetInFlightOutcome('sending', 40), 'stuck');
    assert.equal(sheetInFlightOutcome('queued', 3), 'queued');
    assert.equal(sheetInFlightOutcome('gone', 3), 'gone');
  });
});

describe('PR #35 b2c104f NO-GO fixes (one tab, back/forward and reload)', () => {
  it('own-tab send is not called "another tab"; the tab id survives navigation in the same tab only', async () => {
    const session = createMemoryStorage();
    const id = createSheetTabIdentity({ session, createId: () => 'tab-a' }).id;
    assert.equal(createSheetTabIdentity({ session, createId: () => 'tab-b' }).id, id, 'same tab, same id after navigation/reload');
    assert.notEqual(createSheetTabIdentity({ session: createMemoryStorage(), createId: () => 'tab-b' }).id, id, 'another tab gets its own');

    const server = fakeServer();
    const queue = createMemoryStorage();
    const item = await queue650(server, queue, 'down');
    const link = { clientRequestId: item.clientRequestId, values: item.payload };
    // This tab's own auto-send (e.g. the pass left running when the page was left) sends it.
    await syncSheetQueue({ storage: queue, userId: USER, fetchImpl: server.fetchImpl, timeoutMs: 20, onSend: (sent) => markSentByThisTab(session, USER, sent, id) });
    assert.equal(wasSentByThisTab(session, USER, item.clientRequestId, id), true);
    const gone = sheetSourceGone({ storage: queue, session, tabId: id, userId: USER, hotelId: HOTEL, link, formValues: form('660') });
    assert.deepEqual(gone, { kind: 'edited', oldAmount: 650, newAmount: '660', byThisTab: true });
    assert.equal(
      fillSheetCopy('{old} was sent. Your edit {new} was not saved. Correct it with an adjustment if needed.', { old: '₱650.00', new: '₱660.00' }),
      '₱650.00 was sent. Your edit ₱660.00 was not saved. Correct it with an adjustment if needed.'
    );
    // A different tab's session has no record: that one does say "another tab".
    assert.equal(sheetSourceGone({ storage: queue, session: createMemoryStorage(), tabId: 'tab-z', userId: USER, hotelId: HOTEL, link, formValues: form('660') })?.byThisTab, false);
  });

  it('a held entry is skipped by every auto-send while its choice is pending, even with an empty form', async () => {
    const server = fakeServer();
    const queue = createMemoryStorage();
    const item = await queue650(server, queue, 'down');
    const link = { clientRequestId: item.clientRequestId, values: item.payload, draft: form('560') };
    // This tab after back/forward: the form is empty but the kept draft differs: skip.
    const skips = sheetAutoSendSkips({ storage: queue, userId: USER, hotelId: HOTEL, outletId: null, tabId: 'tab-a', link, formValues: { amount: '' } });
    assert.deepEqual(skips, [item.clientRequestId]);
    assert.deepEqual((await syncSheetQueue({ storage: queue, userId: USER, skipIds: skips, fetchImpl: server.fetchImpl, timeoutMs: 20 })).synced, []);
    // A draft equal to what was queued is not a pending choice: no skip.
    assert.deepEqual(sheetAutoSendSkips({ storage: queue, userId: USER, hotelId: HOTEL, tabId: 'tab-a', link: { ...link, draft: item.payload }, formValues: { amount: '' } }), []);

    // Another tab's auto-send skips it too, through the held mark, until the mark expires.
    const now = 1_000_000;
    writeSheetHeldMark(queue, USER, item.clientRequestId, 'tab-a', now);
    assert.deepEqual(sheetHeldElsewhere(queue, USER, 'tab-b', now + 1000), [item.clientRequestId]);
    assert.deepEqual(sheetHeldElsewhere(queue, USER, 'tab-a', now + 1000), [], 'not skipped by its own tab through the mark');
    const otherTabSkips = sheetAutoSendSkips({ storage: queue, userId: USER, hotelId: HOTEL, tabId: 'tab-b', link: null, formValues: { amount: '' }, now: now + 1000 });
    assert.deepEqual((await syncSheetQueue({ storage: queue, userId: USER, skipIds: otherTabSkips, fetchImpl: server.fetchImpl, timeoutMs: 20 })).synced, []);
    assert.deepEqual(sheetHeldElsewhere(queue, USER, 'tab-b', now + SHEET_HELD_MARK_TTL_MS + 1), [], 'a closed tab does not block it forever');
    clearSheetHeldMarks(queue, USER, 'tab-a', [item.clientRequestId]);
    assert.deepEqual(sheetHeldElsewhere(queue, USER, 'tab-b', now + 1000), []);
    assert.equal(server.rows.length, 0);

    // The in-app Offline Queue page syncs the IndexedDB queue (reservations, payments, charges,
    // cash counts) and never touches the ledger queue, so it cannot send a held entry.
    const offlineSync = readFileSync(new URL('./offline/sync.ts', import.meta.url), 'utf8');
    assert.equal(offlineSync.includes('hotel_ops_ledger_entry_queue'), false);
    assert.equal(offlineSync.includes('/api/ledger'), false);
  });

  it('a reload restores the draft and the choice; if the entry is gone anyway, the edit is reported unsaved', async () => {
    const server = fakeServer();
    const queue = createMemoryStorage();
    const session = createMemoryStorage();
    server.state.mode = 'down';
    const saved = await saveSheetEntryWithQueue({ values: form('500'), previousPayload: null }, options(queue, server.fetchImpl));
    server.state.mode = 'up';
    writeSheetLink(session, USER, HOTEL, { clientRequestId: saved.clientRequestId, values: form('500'), draft: form('510') });

    // Reload: the form is empty (autoComplete off). The link comes back with the draft.
    const state = restoreSheetLinkState(session, queue, USER, HOTEL);
    assert.equal(Number(state.link?.draft?.amount), 510);
    // The page fills the draft back in: the choice shows again, nothing is auto-sent.
    const held = sheetHeldEntry({ formValues: state.link!.draft!, queued: retryableLedgerEntries(queue, USER), hotelId: HOTEL, outletId: null, sourceId: state.link!.clientRequestId });
    assert.equal(held?.clientRequestId, saved.clientRequestId);
    assert.equal(Number(held?.payload.amount), 500);
    const skips = sheetAutoSendSkips({ storage: queue, userId: USER, hotelId: HOTEL, tabId: 'tab-a', link: state.link, formValues: { amount: '' } });
    assert.deepEqual((await syncSheetQueue({ storage: queue, userId: USER, skipIds: skips, fetchImpl: server.fetchImpl, timeoutMs: 20 })).synced, []);
    assert.equal(server.rows.length, 0);

    // If it was sent anyway (another device-wide pass before the mark), the 510 is reported, not dropped.
    await syncSheetQueue({ storage: queue, userId: USER, fetchImpl: server.fetchImpl, timeoutMs: 20 });
    const later = restoreSheetLinkState(session, queue, USER, HOTEL);
    assert.equal(later.link, null);
    const gone = sheetSourceGone({ storage: queue, session, userId: USER, hotelId: HOTEL, link: later.goneLink, formValues: { amount: '' } });
    assert.deepEqual(gone, { kind: 'edited', oldAmount: 500, newAmount: '510', byThisTab: false });
  });

  it('the Saving state always ends, also when the send throws', async () => {
    const gate = createSheetBusyGate();
    const states: boolean[] = [];
    assert.equal(await withSheetSaving(gate, (v) => states.push(v), async () => 'ok'), 'ok');
    await assert.rejects(withSheetSaving(gate, (v) => states.push(v), async () => { throw new Error('network'); }));
    assert.deepEqual(states, [true, false, true, false]);
    assert.equal(gate.busy, false);
  });
});

/** BroadcastChannel stand-in: every channel on the same bus gets every other channel's messages. */
function createBus() {
  const channels = new Set<{ listeners: ((event: { data: unknown }) => void)[] }>();
  function open(): SheetTabChannel {
    const self = { listeners: [] as ((event: { data: unknown }) => void)[] };
    channels.add(self);
    return {
      postMessage(message) {
        for (const other of channels) if (other !== self) for (const listener of other.listeners) listener({ data: structuredClone(message) });
      },
      addEventListener(_type, listener) { self.listeners.push(listener); },
      close() { channels.delete(self); }
    };
  }
  return { open };
}

function copySession(from: ReturnType<typeof createMemoryStorage>, keys: string[]) {
  const copy = createMemoryStorage();
  for (const key of keys) {
    const value = from.getItem(key);
    if (value !== null) copy.setItem(key, value);
  }
  return copy;
}

function fakeTimers() {
  let now = 1_000_000;
  const timers: { at: number; callback: () => void; handle: number }[] = [];
  let next = 1;
  return {
    now: () => now,
    setTimer(callback: () => void, ms: number) { const handle = next++; timers.push({ at: now + ms, callback, handle }); return handle; },
    clearTimer(handle: unknown) { const i = timers.findIndex((t) => t.handle === handle); if (i >= 0) timers.splice(i, 1); },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (!due || due.at > end) break;
        timers.shift();
        now = Math.max(now, due.at);
        due.callback();
      }
      now = end;
    },
    pending: () => timers.length
  };
}

describe('PR #35 e577c4b NO-GO fixes (Duplicate tab, held-mark release)', () => {
  it('Duplicate tab: a copied id that a live tab still answers to gets a new id; a reload keeps its id', async () => {
    const bus = createBus();
    let n = 0;
    const createId = () => `id-${++n}`;
    const session1 = createMemoryStorage();
    const tab1 = createSheetTabIdentity({ session: session1, openChannel: bus.open, createId, probeMs: 5 });
    const first = await tab1.ready;
    markSentByThisTab(session1, USER, 'sent-by-tab-1', first);

    // Chrome Duplicate copies sessionStorage (and window.name, which is not used for identity).
    const session2 = copySession(session1, ['hotel_ops_tab_id', 'hotel_ops_sheet_sent_here:' + USER]);
    const tab2 = createSheetTabIdentity({ session: session2, openChannel: bus.open, createId, probeMs: 5 });
    assert.equal(tab2.id, first, 'before the handshake the copy still carries the id');
    const second = await tab2.ready;
    assert.notEqual(second, first);
    assert.equal(tab2.duplicate, true);
    assert.equal(session2.getItem('hotel_ops_tab_id'), second, 'the copy keeps its new id across its own reloads');
    assert.equal(tab1.id, first, 'the original keeps its id');
    assert.equal(wasSentByThisTab(session2, USER, 'sent-by-tab-1', second), false, 'the copy does not claim the original\'s sends');
    assert.equal(wasSentByThisTab(session1, USER, 'sent-by-tab-1', first), true);

    // A reload of tab 1: the old page is gone, so nobody answers: same id.
    tab1.close();
    const reloaded = createSheetTabIdentity({ session: session1, openChannel: bus.open, createId, probeMs: 5 });
    assert.equal(await reloaded.ready, first);
    assert.equal(reloaded.duplicate, false);
  });

  it('no shared fallback id: sessionStorage that throws gives a random id per page load', async () => {
    const broken = { getItem(): string | null { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const a = createSheetTabIdentity({ session: broken });
    const b = createSheetTabIdentity({ session: broken });
    const c = createSheetTabIdentity({ session: null });
    assert.notEqual(await a.ready, await b.ready);
    assert.notEqual(a.id, c.id);
    for (const id of [a.id, b.id, c.id]) assert.notEqual(id, 'tab');
  });

  it('closing a duplicate keeps the original\'s hold; cleanup drops only this load\'s stamps', () => {
    const queue = createMemoryStorage();
    const now = 1_000_000;
    writeSheetHeldMark(queue, USER, 'entry-400', 'tab-1', now);
    // Even with a shared id (old builds, or before the handshake), the duplicate's load only tracks
    // what it wrote itself. Here the copy held nothing, so its cleanup clears nothing.
    clearSheetHeldMarks(queue, USER, 'tab-1', new Set<string>());
    assert.deepEqual(sheetHeldElsewhere(queue, USER, 'tab-3', now + 1000), ['entry-400']);
    // With distinct ids, both may hold the same entry; closing the copy leaves the original's stamp.
    writeSheetHeldMark(queue, USER, 'entry-400', 'tab-2', now + 10);
    clearSheetHeldMarks(queue, USER, 'tab-2', ['entry-400']);
    assert.deepEqual(sheetHeldElsewhere(queue, USER, 'tab-3', now + 1000), ['entry-400'], 'third tab still skips 400');
    clearSheetHeldMarks(queue, USER, 'tab-1', ['entry-400']);
    assert.deepEqual(sheetHeldElsewhere(queue, USER, 'tab-3', now + 1000), []);
  });

  it('(c) writing a hold prunes expired stamps; old one-holder marks are still read', () => {
    const queue = createMemoryStorage();
    queue.setItem(sheetHeldMarkKey(USER), JSON.stringify({ legacy: { tabId: 'tab-old', at: 1_000 } }));
    assert.deepEqual(sheetHeldElsewhere(queue, USER, 'tab-3', 1_500), ['legacy']);
    writeSheetHeldMark(queue, USER, 'stale', 'tab-9', 2_000);
    writeSheetHeldMark(queue, USER, 'fresh', 'tab-1', 2_000 + SHEET_HELD_MARK_TTL_MS);
    const stored = JSON.parse(queue.getItem(sheetHeldMarkKey(USER)) ?? '{}');
    assert.deepEqual(Object.keys(stored), ['fresh'], 'expired legacy and stale stamps were pruned');
    assert.deepEqual(stored.fresh, { 'tab-1': 2_000 + SHEET_HELD_MARK_TTL_MS });
  });

  it('(a) a flush starts when another tab\'s hold is cleared, or at its expiry time; a refresh does not', async () => {
    const queue = createMemoryStorage();
    const timers = fakeTimers();
    const listeners: ((event: Event) => void)[] = [];
    const win = {
      addEventListener(type: string, listener: (event: Event) => void) { if (type === 'storage') listeners.push(listener); },
      removeEventListener(_type: string, listener: (event: Event) => void) { listeners.splice(listeners.indexOf(listener), 1); }
    };
    const fire = (key: string | null) => { for (const l of [...listeners]) l({ key } as unknown as Event); };
    writeSheetHeldMark(queue, USER, 'entry-400', 'tab-1', timers.now());
    let releases = 0;
    const watch = watchSheetHeldMarks({ win, storage: queue, userId: USER, tabId: () => 'tab-3', onRelease: () => { releases += 1; }, now: timers.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
    assert.equal(nextSheetHeldExpiry(queue, USER, 'tab-3', timers.now()), timers.now() + SHEET_HELD_MARK_TTL_MS);

    // Tab 1 refreshes its stamp: still held, no flush.
    timers.advance(30_000);
    writeSheetHeldMark(queue, USER, 'entry-400', 'tab-1', timers.now());
    fire(sheetHeldMarkKey(USER));
    fire('unrelated');
    assert.equal(releases, 0);

    // Tab 1 clears it (its choice ended): the storage event starts a flush, after the 1 s debounce.
    clearSheetHeldMarks(queue, USER, 'tab-1', ['entry-400']);
    fire(sheetHeldMarkKey(USER));
    assert.equal(releases, 0, 'debounced');
    timers.advance(1_000);
    assert.equal(releases, 1);

    // Tab 1 holds again, then dies without cleanup: the flush starts at the expiry time, no event needed.
    writeSheetHeldMark(queue, USER, 'entry-400', 'tab-1', timers.now());
    fire(sheetHeldMarkKey(USER));
    assert.equal(releases, 1);
    timers.advance(SHEET_HELD_MARK_TTL_MS - 1_000);
    assert.equal(releases, 1, 'not before it expires');
    timers.advance(2_100);
    assert.equal(releases, 2, 'flush at expiry (plus the debounce)');
    assert.equal(timers.pending(), 0, 'nothing left to wait for');

    // And the pass it starts sends the 400: with no hold, the skips are empty.
    assert.deepEqual(sheetAutoSendSkips({ storage: queue, userId: USER, hotelId: HOTEL, tabId: 'tab-3', link: null, formValues: { amount: '' }, now: timers.now() }), []);
    watch.stop();
    assert.equal(listeners.length, 0);
  });

  it('(a) the auto-send restarts after it disarmed with remaining = 0 (held entry was the only one)', async () => {
    const runs: string[] = [];
    const sender = startSheetAutoSend({
      win: { addEventListener() {}, removeEventListener() {} },
      run: async (reason) => { runs.push(reason); return { remaining: 0 }; },
      setTimer: () => 1,
      clearTimer: () => {}
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(runs, ['load']);
    await sender.kick('released');
    assert.deepEqual(runs, ['load', 'released']);
    sender.stop();
  });
});

function storageWindow() {
  const listeners: ((event: Event) => void)[] = [];
  return {
    win: {
      addEventListener(type: string, listener: (event: Event) => void) { if (type === 'storage') listeners.push(listener); },
      removeEventListener(_type: string, listener: (event: Event) => void) { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); }
    },
    fire(key: string | null) { for (const l of [...listeners]) l({ key } as unknown as Event); }
  };
}

describe('PR #35 dcf0a4f regression: a holder reload must not release its hold', () => {
  it('reload with a second sheet tab open: the choice comes back and nothing is auto-sent', async () => {
    const server = fakeServer();
    const queue = createMemoryStorage();
    const timers = fakeTimers();
    const item = await queue650(server, queue, 'down');
    // Tab 1 holds 650 with 560 typed; its link (with the draft) is in its sessionStorage.
    const session1 = createMemoryStorage();
    writeSheetLink(session1, USER, HOTEL, { clientRequestId: item.clientRequestId, values: item.payload, draft: form('560') });
    writeSheetHeldMark(queue, USER, item.clientRequestId, 'tab-1', timers.now());

    // Tab 2: on the sheet, empty form, watching the holds.
    const tab2 = storageWindow();
    let releases = 0;
    const watch = watchSheetHeldMarks({ win: tab2.win, storage: queue, userId: USER, tabId: () => 'tab-2', onRelease: () => { releases += 1; }, now: timers.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

    // Tab 1 reloads: unmount/pagehide no longer clears the mark. On load it re-stamps at once, before the probe.
    timers.advance(200);
    assert.equal(sheetPendingChoiceId({ session: session1, storage: queue, userId: USER, hotelId: HOTEL }), item.clientRequestId);
    const previousAt = holdSheetEntryOnLoad(queue, USER, item.clientRequestId, 'tab-1', timers.now());
    assert.equal(typeof previousAt, 'number', 'its own stamp from before the reload was still there');
    tab2.fire(sheetHeldMarkKey(USER));
    timers.advance(SHEET_HELD_RELEASE_DEBOUNCE_MS * 3);
    assert.equal(releases, 0, 'no release seen by tab 2');

    // Tab 2's pass (any trigger) skips it; nothing is sent during tab 1's probe or after.
    const skips = sheetAutoSendSkips({ storage: queue, userId: USER, hotelId: HOTEL, tabId: 'tab-2', link: null, formValues: { amount: '' }, now: timers.now() });
    assert.deepEqual((await syncSheetQueue({ storage: queue, userId: USER, skipIds: skips, fetchImpl: server.fetchImpl, timeoutMs: 20 })).synced, []);
    assert.equal(server.rows.length, 0);

    // Tab 1 gets its Send/Replace choice back, not the "not saved" gate.
    const state = restoreSheetLinkState(session1, queue, USER, HOTEL);
    assert.equal(state.goneLink, null);
    const held = sheetHeldEntry({ formValues: state.link!.draft!, queued: retryableLedgerEntries(queue, USER), hotelId: HOTEL, outletId: null, sourceId: state.link!.clientRequestId });
    assert.equal(held?.clientRequestId, item.clientRequestId);
    watch.stop();
  });

  it('a duplicate that re-stamped under the copied id moves it to its new id and restores the original\'s stamp', () => {
    const queue = createMemoryStorage();
    writeSheetHeldMark(queue, USER, 'entry', 'tab-1', 1_000);
    const previousAt = holdSheetEntryOnLoad(queue, USER, 'entry', 'tab-1', 2_000);
    assert.equal(previousAt, 1_000);
    rekeySheetHeldMark(queue, USER, 'entry', 'tab-1', 'tab-copy', previousAt, 2_200);
    assert.deepEqual(JSON.parse(queue.getItem(sheetHeldMarkKey(USER)) ?? '{}'), { entry: { 'tab-1': 1_000, 'tab-copy': 2_200 } });
    // No earlier stamp: the copied-id stamp is removed.
    const fresh = createMemoryStorage();
    rekeySheetHeldMark(fresh, USER, 'entry', 'tab-1', 'tab-copy', holdSheetEntryOnLoad(fresh, USER, 'entry', 'tab-1', 2_000), 2_200);
    assert.deepEqual(JSON.parse(fresh.getItem(sheetHeldMarkKey(USER)) ?? '{}'), { entry: { 'tab-copy': 2_200 } });
  });

  it('a holder tab that closed releases only after its mark expires, then the entry is sent', async () => {
    const server = fakeServer();
    const queue = createMemoryStorage();
    const timers = fakeTimers();
    const item = await queue650(server, queue, 'down');
    writeSheetHeldMark(queue, USER, item.clientRequestId, 'tab-1', timers.now());
    const tab2 = storageWindow();
    let releases = 0;
    const watch = watchSheetHeldMarks({ win: tab2.win, storage: queue, userId: USER, tabId: () => 'tab-2', onRelease: () => { releases += 1; }, now: timers.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
    // Tab 1 closes: nothing is written, no event.
    timers.advance(SHEET_HELD_MARK_TTL_MS - 1);
    assert.equal(releases, 0);
    const before = sheetAutoSendSkips({ storage: queue, userId: USER, hotelId: HOTEL, tabId: 'tab-2', link: null, formValues: { amount: '' }, now: timers.now() });
    assert.deepEqual(before, [item.clientRequestId]);
    timers.advance(SHEET_HELD_RELEASE_DEBOUNCE_MS + 100);
    assert.equal(releases, 1);
    const after = sheetAutoSendSkips({ storage: queue, userId: USER, hotelId: HOTEL, tabId: 'tab-2', link: null, formValues: { amount: '' }, now: timers.now() });
    assert.deepEqual(after, []);
    assert.deepEqual((await syncSheetQueue({ storage: queue, userId: USER, skipIds: after, fetchImpl: server.fetchImpl, timeoutMs: 20 })).synced, [item.clientRequestId]);
    assert.equal(server.rows.length, 1);
    watch.stop();
  });

  it('release is debounced about 1 s and re-checked: a re-mark within it cancels the send; bursts send once', () => {
    const queue = createMemoryStorage();
    const timers = fakeTimers();
    const tab2 = storageWindow();
    let releases = 0;
    writeSheetHeldMark(queue, USER, 'entry', 'tab-1', timers.now());
    const watch = watchSheetHeldMarks({ win: tab2.win, storage: queue, userId: USER, tabId: () => 'tab-2', onRelease: () => { releases += 1; }, now: timers.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
    assert.equal(SHEET_HELD_RELEASE_DEBOUNCE_MS, 1_000);

    // Cleared and re-marked within the window (e.g. an older build's reload): no send.
    clearSheetHeldMarks(queue, USER, 'tab-1', ['entry']);
    tab2.fire(sheetHeldMarkKey(USER));
    timers.advance(300);
    writeSheetHeldMark(queue, USER, 'entry', 'tab-1', timers.now());
    tab2.fire(sheetHeldMarkKey(USER));
    timers.advance(2_000);
    assert.equal(releases, 0);

    // Cleared for real, several events in a burst: one send, after the window.
    clearSheetHeldMarks(queue, USER, 'tab-1', ['entry']);
    tab2.fire(sheetHeldMarkKey(USER));
    timers.advance(400);
    tab2.fire(sheetHeldMarkKey(USER));
    tab2.fire(null);
    assert.equal(releases, 0);
    timers.advance(600);
    assert.equal(releases, 1);
    timers.advance(5_000);
    assert.equal(releases, 1);
    watch.stop();
  });
});
