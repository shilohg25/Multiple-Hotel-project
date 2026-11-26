import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LEDGER_NETWORK_ERROR,
  LEDGER_QUEUE_HINT,
  LEDGER_TIMEOUT_ERROR,
  buildLedgerPayload,
  createMemoryStorage,
  pendingLedgerEntries,
  postLedgerEntry,
  queuedLedgerHint,
  readLedgerQueue,
  saveLedgerEntryWithQueue,
  syncPendingLedgerEntries
} from './ledger-entry-queue.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('ledger entry queue', () => {
  it('adds a stable client request id and collectible flag to the payload', () => {
    const payload = buildLedgerPayload({
      hotel_id: 'hotel-1',
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
      hotel_id: 'hotel-1',
      amount: '250.50',
      category: 'add_on',
      description: 'TEST- laundry'
    }, { storage, fetchImpl, createId: () => 'same-id' });

    const second = await saveLedgerEntryWithQueue({
      hotel_id: 'hotel-1',
      amount: '250.50',
      category: 'add_on',
      description: 'TEST- laundry'
    }, { storage, fetchImpl, clientRequestId: first.clientRequestId });

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
    assert.equal(readLedgerQueue(storage).length, 0);
  });

  it('keeps one queued item with the same client id after a network failure', async () => {
    const storage = createMemoryStorage();
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const first = await saveLedgerEntryWithQueue({
      hotel_id: 'hotel-1',
      amount: '80',
      description: 'TEST- snacks'
    }, { storage, fetchImpl, createId: () => 'queued-1' });
    const retry = await saveLedgerEntryWithQueue({
      hotel_id: 'hotel-1',
      amount: '80',
      description: 'TEST- snacks'
    }, { storage, fetchImpl, clientRequestId: 'queued-1' });

    assert.equal(first.ok, false);
    assert.equal(first.retryable, true);
    assert.equal(first.error, LEDGER_NETWORK_ERROR);
    assert.equal(retry.clientRequestId, 'queued-1');
    const queued = pendingLedgerEntries(storage);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].clientRequestId, 'queued-1');
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

    const result = await saveLedgerEntryWithQueue({ amount: '10' }, {
      storage,
      fetchImpl,
      timeoutMs: 20,
      createId: () => 'timeout-1'
    });

    assert.equal(result.ok, false);
    assert.equal(result.retryable, true);
    assert.equal(result.error, LEDGER_TIMEOUT_ERROR);
    assert.equal(pendingLedgerEntries(storage).length, 1);
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

    const failed = await saveLedgerEntryWithQueue({ amount: '40' }, {
      storage,
      fetchImpl,
      createId: () => 'dup-1'
    });
    assert.equal(failed.ok, false);
    assert.equal(pendingLedgerEntries(storage).length, 1);

    const synced = await syncPendingLedgerEntries({ storage, fetchImpl });
    assert.equal(synced.processed, 1);
    assert.equal(synced.synced, 1);
    assert.equal(synced.failed, 0);
    assert.equal(calls, 2);
    assert.equal(readLedgerQueue(storage).length, 0);
  });

  it('does not auto-retry a validation error and drops it from the queue', async () => {
    const storage = createMemoryStorage();
    const fetchImpl = (async () => jsonResponse({ error: 'Amount must be a valid number.' }, 400)) as typeof fetch;
    const result = await saveLedgerEntryWithQueue({ amount: 'abc' }, { storage, fetchImpl, createId: () => 'bad-1' });
    assert.equal(result.ok, false);
    assert.equal(result.retryable, false);
    assert.equal(result.error, 'Amount must be a valid number.');
    assert.equal(pendingLedgerEntries(storage).length, 0);
  });

  it('skips sync when offline and leaves the queued entry in place', async () => {
    const storage = createMemoryStorage();
    await saveLedgerEntryWithQueue({ amount: '15' }, {
      storage,
      fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch,
      createId: () => 'offline-1'
    });
    let called = false;
    const synced = await syncPendingLedgerEntries({
      storage,
      isOnline: () => false,
      fetchImpl: (async () => {
        called = true;
        return jsonResponse({ entry: { id: 'nope' } });
      }) as typeof fetch
    });
    assert.equal(called, false);
    assert.equal(synced.processed, 0);
    assert.equal(pendingLedgerEntries(storage).length, 1);
  });

  it('ignores corrupt localStorage instead of throwing', () => {
    const storage = createMemoryStorage({ hotel_ops_ledger_entry_queue: 'not-json' });
    assert.deepEqual(readLedgerQueue(storage), []);
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
});
