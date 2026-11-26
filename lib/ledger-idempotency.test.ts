import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LEDGER_IDEMPOTENCY_IN_PROGRESS,
  LEDGER_RESERVATION_STALE_MS,
  createLedgerEntryOnce,
  createMemoryLedgerIdempotencyStore,
  mayReturnLedgerDuplicate,
  scopedLedgerRequestId
} from './ledger-idempotency.ts';

const userA = 'user-a';
const userB = 'user-b';
const hotel1 = 'hotel-1';
const hotel2 = 'hotel-2';
const clientId = 'pr33-cross-user-00000000-0000-4000-8000-000000000099';

function entry(id: string, userId: string, hotelId: string, amount = 12.5) {
  return { id, hotel_id: hotelId, created_by: userId, amount };
}

describe('scoped ledger request ids', () => {
  it('is stable for the same user, hotel, and client id, and changes when user or hotel changes', () => {
    const first = scopedLedgerRequestId(userA, hotel1, clientId);
    assert.equal(first, scopedLedgerRequestId(userA, hotel1, clientId));
    assert.notEqual(first, scopedLedgerRequestId(userB, hotel1, clientId));
    assert.notEqual(first, scopedLedgerRequestId(userA, hotel2, clientId));
    assert.equal(first.startsWith('led:'), true);
  });

  it('does not let another user or hotel receive the original entry', () => {
    const row = {
      client_request_id: scopedLedgerRequestId(userA, hotel1, clientId),
      request_type: 'ledger_entry.create',
      server_table: 'ledger_entries',
      server_id: 'entry-a',
      status: 'processed',
      created_by: userA
    };
    const owned = entry('entry-a', userA, hotel1);
    assert.equal(mayReturnLedgerDuplicate(row, owned, userA, hotel1), true);
    assert.equal(mayReturnLedgerDuplicate(row, owned, userB, hotel1), false);
    assert.equal(mayReturnLedgerDuplicate(row, owned, userA, hotel2), false);
    assert.equal(mayReturnLedgerDuplicate(row, { ...owned, hotel_id: hotel2 }, userA, hotel1), false);
  });
});

describe('createLedgerEntryOnce', () => {
  it('rejects a cross-user replay of the same client request id and does not return the original entry', async () => {
    const store = createMemoryLedgerIdempotencyStore();
    const entries = new Map<string, ReturnType<typeof entry>>();
    const first = await createLedgerEntryOnce({
      userId: userA,
      hotelId: hotel2,
      clientRequestId: clientId,
      store,
      createEntry: async (id) => {
        const record = entry(id || 'entry-owner', userA, hotel2);
        entries.set(record.id, record);
        return record;
      },
      getEntry: async (id) => entries.get(id) ?? null
    });
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error('expected first save to succeed');

    let createdForB = 0;
    const second = await createLedgerEntryOnce({
      userId: userB,
      hotelId: hotel2,
      clientRequestId: clientId,
      store,
      createEntry: async (id) => {
        createdForB += 1;
        const record = entry(id || 'entry-cashier', userB, hotel2);
        entries.set(record.id, record);
        return record;
      },
      getEntry: async (id) => entries.get(id) ?? null
    });

    assert.equal(second.ok, true);
    if (!second.ok) throw new Error('expected second user to create their own entry');
    assert.equal(second.duplicate, false);
    assert.notEqual(second.entry.id, first.entry.id);
    assert.equal(second.entry.created_by, userB);
    assert.equal(createdForB, 1);
  });

  it('rejects a cross-hotel replay of the same client request id and does not return the original entry', async () => {
    const store = createMemoryLedgerIdempotencyStore();
    const entries = new Map<string, ReturnType<typeof entry>>();
    const first = await createLedgerEntryOnce({
      userId: userA,
      hotelId: hotel1,
      clientRequestId: clientId,
      store,
      createEntry: async (id) => {
        const record = entry(id || 'entry-h1', userA, hotel1);
        entries.set(record.id, record);
        return record;
      },
      getEntry: async (id) => entries.get(id) ?? null
    });
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error('expected first hotel save to succeed');

    const second = await createLedgerEntryOnce({
      userId: userA,
      hotelId: hotel2,
      clientRequestId: clientId,
      store,
      createEntry: async (id) => {
        const record = entry(id || 'entry-h2', userA, hotel2);
        entries.set(record.id, record);
        return record;
      },
      getEntry: async (id) => entries.get(id) ?? null
    });

    assert.equal(second.ok, true);
    if (!second.ok) throw new Error('expected second hotel to create its own entry');
    assert.equal(second.duplicate, false);
    assert.notEqual(second.entry.id, first.entry.id);
    assert.equal(second.entry.hotel_id, hotel2);
  });

  it('lets only the request that reserved the row insert, and returns the original entry to the same user and hotel', async () => {
    const store = createMemoryLedgerIdempotencyStore();
    let created = 0;
    const entries = new Map<string, ReturnType<typeof entry>>();
    const createEntry = async (id?: string) => {
      created += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const record = entry(id || 'entry-shared', userA, hotel1);
      entries.set(record.id, record);
      return record;
    };
    const getEntry = async (id: string) => entries.get(id) ?? null;

    const [first, second] = await Promise.all([
      createLedgerEntryOnce({
        userId: userA,
        hotelId: hotel1,
        clientRequestId: clientId,
        store,
        createEntry,
        getEntry,
        delayMs: 5,
        attempts: 40
      }),
      createLedgerEntryOnce({
        userId: userA,
        hotelId: hotel1,
        clientRequestId: clientId,
        store,
        createEntry,
        getEntry,
        delayMs: 5,
        attempts: 40
      })
    ]);

    assert.equal(created, 1);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) throw new Error('expected both concurrent results to succeed');
    assert.equal(first.entry.id, second.entry.id);
    assert.equal(first.duplicate || second.duplicate, true);
    assert.equal(first.duplicate && second.duplicate, false);
  });

  it('does not return another user\'s entry even if the store row is read during a wait', async () => {
    const scoped = scopedLedgerRequestId(userA, hotel1, clientId);
    const store = createMemoryLedgerIdempotencyStore([{
      client_request_id: scoped,
      request_type: 'ledger_entry.create',
      server_table: 'ledger_entries',
      server_id: 'entry-a',
      status: 'processed',
      created_by: userA
    }]);

    let created = 0;
    const result = await createLedgerEntryOnce({
      userId: userB,
      hotelId: hotel1,
      clientRequestId: 'other-id',
      store,
      createEntry: async () => {
        created += 1;
        return entry('entry-b', userB, hotel1);
      },
      getEntry: async () => entry('entry-a', userA, hotel1)
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('expected user B to insert their own entry');
    assert.equal(result.entry.id, 'entry-b');
    assert.equal(created, 1);

    const stolen = await createLedgerEntryOnce({
      userId: userB,
      hotelId: hotel1,
      clientRequestId: clientId,
      store: createMemoryLedgerIdempotencyStore([{
        client_request_id: scopedLedgerRequestId(userB, hotel1, clientId),
        request_type: 'ledger_entry.create',
        server_table: 'ledger_entries',
        server_id: 'entry-a',
        status: 'processed',
        created_by: userA
      }]),
      createEntry: async () => entry('should-not-insert', userB, hotel1),
      getEntry: async () => entry('entry-a', userA, hotel1),
      attempts: 2,
      delayMs: 1
    });
    assert.equal(stolen.ok, false);
    if (stolen.ok) throw new Error('expected stolen lookup to be denied');
    assert.equal(stolen.status, 403);
    assert.equal(stolen.error, 'Hotel access denied.');
  });

  it('tells a losing concurrent request to retry if the reserved row never completes', async () => {
    const store = createMemoryLedgerIdempotencyStore();
    await store.tryReserve({
      clientRequestId: scopedLedgerRequestId(userA, hotel1, clientId),
      requestType: 'ledger_entry.create',
      createdBy: userA
    });

    const result = await createLedgerEntryOnce({
      userId: userA,
      hotelId: hotel1,
      clientRequestId: clientId,
      store,
      createEntry: async () => entry('should-not-insert', userA, hotel1),
      getEntry: async () => null,
      attempts: 2,
      delayMs: 1
    });

    assert.equal(result.ok, false);
    if (result.ok) throw new Error('expected in-progress failure');
    assert.equal(result.status, 409);
    assert.equal(result.error, LEDGER_IDEMPOTENCY_IN_PROGRESS);
  });


  it('does not release or double-insert when complete() throws after a successful insert', async () => {
    const store = createMemoryLedgerIdempotencyStore();
    let completes = 0;
    const wrapped = {
      ...store,
      async complete(_input: Parameters<typeof store.complete>[0]) {
        completes += 1;
        throw new Error('complete failed');
      }
    };
    let created = 0;
    const entries = new Map<string, ReturnType<typeof entry>>();
    const createEntry = async (id?: string) => {
      created += 1;
      const record = entry(id || `entry-${created}`, userA, hotel1);
      entries.set(record.id, record);
      return record;
    };
    const getEntry = async (id: string) => entries.get(id) ?? null;

    const first = await createLedgerEntryOnce({
      userId: userA,
      hotelId: hotel1,
      clientRequestId: clientId,
      store: wrapped,
      createEntry,
      getEntry
    });
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error('expected first save to succeed after insert');
    assert.equal(first.duplicate, false);
    assert.equal(created, 1);
    assert.equal(completes >= 1, true);

    const scoped = scopedLedgerRequestId(userA, hotel1, clientId);
    const row = await store.get(scoped);
    assert.equal(row?.server_id, first.entry.id);
    assert.notEqual(row?.status, 'processed');

    const second = await createLedgerEntryOnce({
      userId: userA,
      hotelId: hotel1,
      clientRequestId: clientId,
      store: wrapped,
      createEntry,
      getEntry,
      attempts: 4,
      delayMs: 1
    });
    assert.equal(second.ok, true);
    if (!second.ok) throw new Error('expected retry to return the already-inserted entry');
    assert.equal(second.duplicate, true);
    assert.equal(second.entry.id, first.entry.id);
    assert.equal(created, 1);
    assert.equal(entries.size, 1);
  });

  it('still releases a reservation when the insert never happens so a retry can create the entry', async () => {
    const store = createMemoryLedgerIdempotencyStore();
    let shouldFail = true;
    let created = 0;
    const entries = new Map<string, ReturnType<typeof entry>>();
    const createEntry = async (id?: string) => {
      if (shouldFail) throw new Error('invalid payment method');
      created += 1;
      const record = entry(id || `entry-${created}`, userA, hotel1);
      entries.set(record.id, record);
      return record;
    };

    await assert.rejects(
      () => createLedgerEntryOnce({
        userId: userA,
        hotelId: hotel1,
        clientRequestId: clientId,
        store,
        createEntry,
        getEntry: async (id) => entries.get(id) ?? null
      }),
      /invalid payment method/
    );
    assert.equal(await store.get(scopedLedgerRequestId(userA, hotel1, clientId)), null);

    shouldFail = false;
    const retry = await createLedgerEntryOnce({
      userId: userA,
      hotelId: hotel1,
      clientRequestId: clientId,
      store,
      createEntry,
      getEntry: async (id) => entries.get(id) ?? null
    });
    assert.equal(retry.ok, true);
    if (!retry.ok) throw new Error('expected retry after a failed insert to succeed');
    assert.equal(retry.duplicate, false);
    assert.equal(created, 1);
  });

  it('lets only one of two concurrent reclaimers insert a stale reserved key', async () => {
    const scoped = scopedLedgerRequestId(userA, hotel1, clientId);
    const staleAt = new Date(Date.now() - LEDGER_RESERVATION_STALE_MS - 1_000).toISOString();
    const store = createMemoryLedgerIdempotencyStore([{
      client_request_id: scoped,
      request_type: 'ledger_entry.create',
      server_table: null,
      server_id: null,
      status: 'reserved',
      created_by: userA,
      created_at: staleAt
    }]);

    let created = 0;
    const entries = new Map<string, ReturnType<typeof entry>>();
    const createEntry = async (id?: string) => {
      created += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const record = entry(id || `reclaimed-${created}`, userA, hotel1);
      entries.set(record.id, record);
      return record;
    };
    const getEntry = async (id: string) => entries.get(id) ?? null;
    const options = {
      userId: userA,
      hotelId: hotel1,
      clientRequestId: clientId,
      store,
      createEntry,
      getEntry,
      delayMs: 5,
      attempts: 40,
      now: () => new Date()
    };

    const [first, second] = await Promise.all([
      createLedgerEntryOnce(options),
      createLedgerEntryOnce(options)
    ]);

    assert.equal(created, 1);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) throw new Error('expected both reclaimers to resolve');
    assert.equal(first.entry.id, second.entry.id);
    assert.equal(first.duplicate || second.duplicate, true);
    assert.equal(first.duplicate && second.duplicate, false);
    assert.equal(entries.size, 1);
    const row = await store.get(scoped);
    assert.equal(row?.server_id, first.entry.id);
    assert.equal(row?.status, 'processed');
  });

  it('does not let another user reclaim a stale reservation', async () => {
    const scoped = scopedLedgerRequestId(userA, hotel1, clientId);
    const store = createMemoryLedgerIdempotencyStore([{
      client_request_id: scoped,
      request_type: 'ledger_entry.create',
      server_table: null,
      server_id: null,
      status: 'reserved',
      created_by: userA,
      created_at: new Date(Date.now() - LEDGER_RESERVATION_STALE_MS - 1_000).toISOString()
    }]);

    let created = 0;
    const result = await createLedgerEntryOnce({
      userId: userB,
      hotelId: hotel1,
      clientRequestId: clientId,
      store,
      createEntry: async (id) => {
        created += 1;
        return entry(id || 'should-not-insert', userB, hotel1);
      },
      getEntry: async () => null,
      attempts: 2,
      delayMs: 1,
      now: () => new Date()
    });

    // user B uses a different scoped key, so they reserve their own row and insert.
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('expected other user to insert under their own key');
    assert.equal(created, 1);
    const original = await store.get(scoped);
    assert.equal(original?.status, 'reserved');
    assert.equal(original?.server_id, null);
  });


  it('does not insert a second row when two reclaimers find a stale reservation that already has a server_id', async () => {
    const scoped = scopedLedgerRequestId(userA, hotel1, clientId);
    const existingId = 'already-inserted';
    const entries = new Map([[existingId, entry(existingId, userA, hotel1)]]);
    const store = createMemoryLedgerIdempotencyStore([{
      client_request_id: scoped,
      request_type: 'ledger_entry.create',
      server_table: 'ledger_entries',
      server_id: existingId,
      status: 'reserved',
      created_by: userA,
      created_at: new Date(Date.now() - LEDGER_RESERVATION_STALE_MS - 1_000).toISOString()
    }]);

    let created = 0;
    const options = {
      userId: userA,
      hotelId: hotel1,
      clientRequestId: clientId,
      store,
      createEntry: async (id?: string) => {
        created += 1;
        const record = entry(id || `second-${created}`, userA, hotel1);
        entries.set(record.id, record);
        return record;
      },
      getEntry: async (id: string) => entries.get(id) ?? null,
      delayMs: 5,
      attempts: 20,
      now: () => new Date()
    };

    const [first, second] = await Promise.all([
      createLedgerEntryOnce(options),
      createLedgerEntryOnce(options)
    ]);

    assert.equal(created, 0);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) throw new Error('expected both to return the existing entry');
    assert.equal(first.entry.id, existingId);
    assert.equal(second.entry.id, existingId);
    assert.equal(first.duplicate, true);
    assert.equal(second.duplicate, true);
    const row = await store.get(scoped);
    assert.equal(row?.status, 'processed');
    assert.equal(row?.server_id, existingId);
  });
});
