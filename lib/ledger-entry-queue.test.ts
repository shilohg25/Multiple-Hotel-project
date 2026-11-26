import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LEDGER_NEEDS_ATTENTION_ERROR,
  LEDGER_NETWORK_ERROR,
  LEDGER_QUEUE_HINT,
  LEDGER_TIMEOUT_ERROR,
  buildLedgerPayload,
  createMemoryStorage,
  ledgerQueueStorageKey,
  needsAttentionLedgerEntries,
  pendingLedgerEntries,
  postLedgerEntry,
  queuedLedgerHint,
  readLedgerQueue,
  resetStaleSyncingLedgerEntries,
  resolveLedgerClientRequestId,
  saveLedgerEntryWithQueue,
  syncPendingLedgerEntries
} from './ledger-entry-queue.ts';

const USER_A = 'user-a';
const USER_B = 'user-b';
const HOTEL_1 = 'hotel-1';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('ledger entry queue', () => {
  it('adds a stable client request id and collectible flag to the payload', () => {
    const payload = buildLedgerPayload({
      hotel_id: HOTEL_1,
      entry_date: '2026-11-26',
      category: 'collectible',
      amount: '100.00',
      description: 'TEST- unpaid minibar'
    }, { outletId: 'outlet-1', clientRequestId: 'req-1' });

    assert.equal(payload.client_request_id, 'req-1');
    assert.equal(payload.is_collectible, 'true');
    assert.equal(payload.outlet_id, 'outlet-1');
    assert.equal(payload.amount, '100.00');
  });

  it('does not change the entered amount when queueing or retrying', async () => {
    const storage = createMemoryStorage();
    const seen: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(init?.body || ''));
      return jsonResponse({ entry: { id: 'entry-1', amount: 250.5 } });
    }) as typeof fetch;

    const first = await saveLedgerEntryWithQueue({
      hotel_id: HOTEL_1,
      amount: '250.50',
      category: 'add_on',
      description: 'TEST- laundry'
    }, { storage, userId: USER_A, hotelId: HOTEL_1, fetchImpl, createId: () => 'same-id' });

    const second = await saveLedgerEntryWithQueue({
      hotel_id: HOTEL_1,
      amount: '250.50',
      category: 'add_on',
      description: 'TEST- laundry'
    }, { storage, userId: USER_A, hotelId: HOTEL_1, fetchImpl, clientRequestId: first.clientRequestId });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.clientRequestId, 'same-id');
    assert.equal(second.clientRequestId, 'same-id');
    assert.equal(seen.length, 2);
    for (const body of seen) {
      const parsed = JSON.parse(body) as { amount: string; client_request_id: string };
      assert.equal(parsed.amount, '250.50');
      assert.equal(parsed.client_request_id, 'same-id');
    }
    assert.equal(readLedgerQueue(storage, USER_A).length, 0);
  });

  it('writes pending before syncing when queueing an entry', async () => {
    const storage = createMemoryStorage();
    const statuses: string[] = [];
    const wrapped: typeof storage = {
      getItem: (key) => storage.getItem(key),
      removeItem: (key) => storage.removeItem(key),
      setItem(key, value) {
        storage.setItem(key, value);
        const items = JSON.parse(value) as { status?: string }[];
        for (const item of items) {
          if (item.status) statuses.push(item.status);
        }
      }
    };
    const fetchImpl = (async () => jsonResponse({ entry: { id: 'ok' } })) as typeof fetch;
    await saveLedgerEntryWithQueue({ hotel_id: HOTEL_1, amount: '5' }, {
      storage: wrapped,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl,
      createId: () => 'pending-1'
    });
    assert.equal(statuses.includes('pending'), true);
    assert.equal(statuses.indexOf('pending') < statuses.indexOf('syncing'), true);
  });

  it('keeps one queued item with the same client id after a network failure', async () => {
    const storage = createMemoryStorage();
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const first = await saveLedgerEntryWithQueue({
      hotel_id: HOTEL_1,
      amount: '80',
      description: 'TEST- snacks'
    }, { storage, userId: USER_A, hotelId: HOTEL_1, fetchImpl, createId: () => 'queued-1' });
    const retry = await saveLedgerEntryWithQueue({
      hotel_id: HOTEL_1,
      amount: '80',
      description: 'TEST- snacks'
    }, { storage, userId: USER_A, hotelId: HOTEL_1, fetchImpl, clientRequestId: 'queued-1' });

    assert.equal(first.ok, false);
    assert.equal(first.retryable, true);
    assert.equal(first.error, LEDGER_NETWORK_ERROR);
    assert.equal(retry.clientRequestId, 'queued-1');
    const queued = pendingLedgerEntries(storage, USER_A);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].clientRequestId, 'queued-1');
    assert.equal(queued[0].userId, USER_A);
    assert.equal(queued[0].hotelId, HOTEL_1);
    assert.equal(queued[0].payload.amount, '80');
    assert.equal(queuedLedgerHint(first.error, first.retryable), `${LEDGER_NETWORK_ERROR} ${LEDGER_QUEUE_HINT}`);
  });

  it('maps a hung timeout to a plain-language retryable error and keeps the queue item', async () => {
    const storage = createMemoryStorage();
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const fail = () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      };
      if (signal?.aborted) fail();
      else signal?.addEventListener('abort', fail, { once: true });
    })) as typeof fetch;

    const result = await saveLedgerEntryWithQueue({ hotel_id: HOTEL_1, amount: '10' }, {
      storage,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl,
      timeoutMs: 20,
      createId: () => 'timeout-1'
    });

    assert.equal(result.ok, false);
    assert.equal(result.retryable, true);
    assert.equal(result.error, LEDGER_TIMEOUT_ERROR);
    assert.equal(pendingLedgerEntries(storage, USER_A).length, 1);
  });

  it('treats a successful retry of the same client id as one save, including server duplicates', async () => {
    const storage = createMemoryStorage();
    let calls = 0;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      const body = JSON.parse(String(init?.body || '{}')) as { client_request_id?: string };
      assert.equal(body.client_request_id, 'dup-1');
      if (calls === 1) throw new TypeError('Failed to fetch');
      return jsonResponse({ entry: { id: 'entry-9' }, duplicate: true });
    }) as typeof fetch;

    const failed = await saveLedgerEntryWithQueue({ hotel_id: HOTEL_1, amount: '40' }, {
      storage,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl,
      createId: () => 'dup-1'
    });
    assert.equal(failed.ok, false);
    assert.equal(pendingLedgerEntries(storage, USER_A).length, 1);

    const synced = await syncPendingLedgerEntries({ storage, userId: USER_A, fetchImpl });
    assert.equal(synced.processed, 1);
    assert.equal(synced.synced, 1);
    assert.equal(synced.failed, 0);
    assert.equal(calls, 2);
    assert.equal(readLedgerQueue(storage, USER_A).length, 0);
  });

  it('does not auto-retry a validation error and drops it from the queue', async () => {
    const storage = createMemoryStorage();
    const fetchImpl = (async () => jsonResponse({ error: 'Amount must be a valid number.' }, 400)) as typeof fetch;
    const result = await saveLedgerEntryWithQueue({ hotel_id: HOTEL_1, amount: 'abc' }, {
      storage,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl,
      createId: () => 'bad-1'
    });
    assert.equal(result.ok, false);
    assert.equal(result.retryable, false);
    assert.equal(result.error, 'Amount must be a valid number.');
    assert.equal(pendingLedgerEntries(storage, USER_A).length, 0);
  });

  it('skips sync when offline and leaves the queued entry in place', async () => {
    const storage = createMemoryStorage();
    await saveLedgerEntryWithQueue({ hotel_id: HOTEL_1, amount: '15' }, {
      storage,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch,
      createId: () => 'offline-1'
    });
    let called = false;
    const synced = await syncPendingLedgerEntries({
      storage,
      userId: USER_A,
      isOnline: () => false,
      fetchImpl: (async () => {
        called = true;
        return jsonResponse({ entry: { id: 'nope' } });
      }) as typeof fetch
    });
    assert.equal(called, false);
    assert.equal(synced.processed, 0);
    assert.equal(pendingLedgerEntries(storage, USER_A).length, 1);
  });

  it('ignores corrupt localStorage instead of throwing', () => {
    const storage = createMemoryStorage({ [ledgerQueueStorageKey(USER_A)]: 'not-json' });
    assert.deepEqual(readLedgerQueue(storage, USER_A), []);
  });

  it('returns a timeout message from postLedgerEntry without hanging', async () => {
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const fail = () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      };
      if (init?.signal?.aborted) fail();
      else init?.signal?.addEventListener('abort', fail, { once: true });
    })) as typeof fetch;
    const result = await postLedgerEntry({ amount: '1' }, { timeoutMs: 15, fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(result.retryable, true);
    assert.equal(result.error, LEDGER_TIMEOUT_ERROR);
  });

  it('isolates the queue by user and only flushes the signed-in user\'s entries', async () => {
    const storage = createMemoryStorage();
    const posted: string[] = [];
    const failFetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    await saveLedgerEntryWithQueue({ hotel_id: HOTEL_1, amount: '11', description: 'TEST- user a' }, {
      storage,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl: failFetch,
      createId: () => 'a-1'
    });
    await saveLedgerEntryWithQueue({ hotel_id: HOTEL_1, amount: '22', description: 'TEST- user b' }, {
      storage,
      userId: USER_B,
      hotelId: HOTEL_1,
      fetchImpl: failFetch,
      createId: () => 'b-1'
    });

    assert.equal(pendingLedgerEntries(storage, USER_A).length, 1);
    assert.equal(pendingLedgerEntries(storage, USER_B).length, 1);
    assert.equal(readLedgerQueue(storage, USER_A)[0].clientRequestId, 'a-1');
    assert.equal(readLedgerQueue(storage, USER_B)[0].clientRequestId, 'b-1');

    const synced = await syncPendingLedgerEntries({
      storage,
      userId: USER_B,
      fetchImpl: (async (_input, init) => {
        const body = JSON.parse(String(init?.body || '{}')) as { client_request_id?: string };
        posted.push(String(body.client_request_id || ''));
        return jsonResponse({ entry: { id: 'b-saved' } });
      }) as typeof fetch
    });

    assert.deepEqual(posted, ['b-1']);
    assert.equal(synced.synced, 1);
    assert.equal(pendingLedgerEntries(storage, USER_B).length, 0);
    assert.equal(pendingLedgerEntries(storage, USER_A).length, 1);
    assert.equal(pendingLedgerEntries(storage, USER_A)[0].payload.amount, '11');
  });

  it('keeps a 401 or 403 entry flagged needs attention and does not drop or auto-flush it', async () => {
    const storage = createMemoryStorage();
    const result = await saveLedgerEntryWithQueue({ hotel_id: HOTEL_1, amount: '30', description: 'TEST- blocked' }, {
      storage,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl: (async () => jsonResponse({ error: 'Hotel access denied.' }, 403)) as typeof fetch,
      createId: () => 'auth-1'
    });

    assert.equal(result.ok, false);
    assert.equal(result.retryable, false);
    assert.equal(result.needsAttention, true);
    assert.equal(result.status, 403);
    const held = needsAttentionLedgerEntries(storage, USER_A);
    assert.equal(held.length, 1);
    assert.equal(held[0].status, 'needs_attention');
    assert.equal(held[0].clientRequestId, 'auth-1');
    assert.equal(pendingLedgerEntries(storage, USER_A).length, 0);

    let called = false;
    const synced = await syncPendingLedgerEntries({
      storage,
      userId: USER_A,
      fetchImpl: (async () => {
        called = true;
        return jsonResponse({ entry: { id: 'should-not-send' } });
      }) as typeof fetch
    });
    assert.equal(called, false);
    assert.equal(synced.processed, 0);
    assert.equal(needsAttentionLedgerEntries(storage, USER_A).length, 1);
    assert.equal(queuedLedgerHint('Hotel access denied.', false, true).includes(LEDGER_NEEDS_ATTENTION_ERROR), true);

    const unauthorized = await saveLedgerEntryWithQueue({ hotel_id: HOTEL_1, amount: '31' }, {
      storage,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl: (async () => jsonResponse({ error: 'Unauthorized' }, 401)) as typeof fetch,
      createId: () => 'auth-2'
    });
    assert.equal(unauthorized.ok, false);
    if (unauthorized.ok) throw new Error('expected 401 to fail');
    assert.equal(unauthorized.needsAttention, true);
    assert.equal(needsAttentionLedgerEntries(storage, USER_A).length, 2);
  });

  it('resets stale syncing items to pending so they retry', async () => {
    const storage = createMemoryStorage();
    await saveLedgerEntryWithQueue({ hotel_id: HOTEL_1, amount: '9', description: 'TEST- stale' }, {
      storage,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch,
      createId: () => 'stale-1'
    });
    const current = readLedgerQueue(storage, USER_A);
    storage.setItem(ledgerQueueStorageKey(USER_A), JSON.stringify([{ ...current[0], status: 'syncing' }]));
    assert.equal(pendingLedgerEntries(storage, USER_A).length, 0);

    const reset = resetStaleSyncingLedgerEntries(storage, USER_A);
    assert.equal(reset.length, 1);
    assert.equal(reset[0].status, 'pending');
    assert.equal(pendingLedgerEntries(storage, USER_A)[0].status, 'pending');

    let calls = 0;
    const synced = await syncPendingLedgerEntries({
      storage,
      userId: USER_A,
      fetchImpl: (async () => {
        calls += 1;
        return jsonResponse({ entry: { id: 'stale-saved' } });
      }) as typeof fetch
    });
    assert.equal(calls, 1);
    assert.equal(synced.synced, 1);
    assert.equal(readLedgerQueue(storage, USER_A).length, 0);
  });

  it('times out a save when the JSON body stalls, instead of hanging', async () => {
    const fetchImpl = (async (_input, init) => {
      const response = new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      Object.defineProperty(response, 'json', {
        value: () => new Promise((_resolve, reject) => {
          const fail = () => {
            const error = new Error('The operation was aborted.');
            error.name = 'AbortError';
            reject(error);
          };
          if (init?.signal?.aborted) fail();
          else init?.signal?.addEventListener('abort', fail, { once: true });
        })
      });
      return response;
    }) as typeof fetch;

    const result = await postLedgerEntry({ hotel_id: HOTEL_1, amount: '10' }, { timeoutMs: 25, fetchImpl });
    assert.equal(result.ok, false);
    assert.equal(result.retryable, true);
    assert.equal(result.error, LEDGER_TIMEOUT_ERROR);
  });

  it('reuses a client request id only when retrying the same payload, and mints a new id after the form changes', async () => {
    assert.equal(resolveLedgerClientRequestId({
      requestedId: 'old-id',
      previousPayload: { hotel_id: HOTEL_1, amount: '10', description: 'TEST- snacks' },
      formValues: { hotel_id: HOTEL_1, amount: '10', description: 'TEST- snacks' },
      hotelId: HOTEL_1
    }), 'old-id');
    const editedId = resolveLedgerClientRequestId({
      requestedId: 'old-id',
      previousPayload: { hotel_id: HOTEL_1, amount: '10', description: 'TEST- snacks' },
      formValues: { hotel_id: HOTEL_1, amount: '25', description: 'TEST- snacks' },
      hotelId: HOTEL_1,
      createId: () => 'new-id'
    });
    assert.equal(editedId, 'new-id');

    const storage = createMemoryStorage();
    const posted: string[] = [];
    const failThenSucceed = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { client_request_id?: string; amount?: string };
      posted.push(`${body.client_request_id}:${body.amount}`);
      if (body.amount === '10') throw new TypeError('Failed to fetch');
      return jsonResponse({ entry: { id: 'saved-edited' }, duplicate: body.client_request_id === 'old-id' });
    }) as typeof fetch;

    const failed = await saveLedgerEntryWithQueue({
      hotel_id: HOTEL_1,
      amount: '10',
      description: 'TEST- snacks'
    }, { storage, userId: USER_A, hotelId: HOTEL_1, fetchImpl: failThenSucceed, createId: () => 'old-id' });
    assert.equal(failed.ok, false);
    assert.equal(failed.clientRequestId, 'old-id');

    const identicalRetry = await saveLedgerEntryWithQueue({
      hotel_id: HOTEL_1,
      amount: '10',
      description: 'TEST- snacks'
    }, {
      storage,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl: failThenSucceed,
      clientRequestId: 'old-id',
      previousPayload: { hotel_id: HOTEL_1, amount: '10', description: 'TEST- snacks' }
    });
    assert.equal(identicalRetry.ok, false);
    assert.equal(identicalRetry.clientRequestId, 'old-id');

    let nextId = 0;
    const edited = await saveLedgerEntryWithQueue({
      hotel_id: HOTEL_1,
      amount: '25',
      description: 'TEST- snacks'
    }, {
      storage,
      userId: USER_A,
      hotelId: HOTEL_1,
      fetchImpl: failThenSucceed,
      clientRequestId: 'old-id',
      previousPayload: { hotel_id: HOTEL_1, amount: '10', description: 'TEST- snacks' },
      createId: () => `new-${++nextId}`
    });
    assert.equal(edited.ok, true);
    assert.equal(edited.duplicate, false);
    assert.equal(edited.clientRequestId, 'new-1');
    assert.deepEqual(posted, ['old-id:10', 'old-id:10', 'new-1:25']);
    assert.equal(readLedgerQueue(storage, USER_A).length, 0);
  });
});
