import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LEDGER_IDEMPOTENCY_IN_PROGRESS,
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
    const first = await createLedgerEntryOnce({
      userId: userA,
      hotelId: hotel2,
      clientRequestId: clientId,
      store,
      createEntry: async () => entry('entry-owner', userA, hotel2),
      getEntry: async (id) => entry(id, userA, hotel2)
    });
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error('expected first save to succeed');

    let createdForB = 0;
    const second = await createLedgerEntryOnce({
      userId: userB,
      hotelId: hotel2,
      clientRequestId: clientId,
      store,
      createEntry: async () => {
        createdForB += 1;
        return entry('entry-cashier', userB, hotel2);
      },
      getEntry: async (id) => (id === 'entry-owner' ? entry(id, userA, hotel2) : entry(id, userB, hotel2))
    });

    assert.equal(second.ok, true);
    if (!second.ok) throw new Error('expected second user to create their own entry');
    assert.equal(second.duplicate, false);
    assert.equal(second.entry.id, 'entry-cashier');
    assert.notEqual(second.entry.id, first.entry.id);
    assert.equal(createdForB, 1);
  });

  it('rejects a cross-hotel replay of the same client request id and does not return the original entry', async () => {
    const store = createMemoryLedgerIdempotencyStore();
    const first = await createLedgerEntryOnce({
      userId: userA,
      hotelId: hotel1,
      clientRequestId: clientId,
      store,
      createEntry: async () => entry('entry-h1', userA, hotel1),
      getEntry: async (id) => entry(id, userA, hotel1)
    });
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error('expected first hotel save to succeed');

    const second = await createLedgerEntryOnce({
      userId: userA,
      hotelId: hotel2,
      clientRequestId: clientId,
      store,
      createEntry: async () => entry('entry-h2', userA, hotel2),
      getEntry: async (id) => (id === 'entry-h1' ? entry(id, userA, hotel1) : entry(id, userA, hotel2))
    });

    assert.equal(second.ok, true);
    if (!second.ok) throw new Error('expected second hotel to create its own entry');
    assert.equal(second.duplicate, false);
    assert.equal(second.entry.id, 'entry-h2');
    assert.notEqual(second.entry.id, first.entry.id);
  });

  it('lets only the request that reserved the row insert, and returns the original entry to the same user and hotel', async () => {
    const store = createMemoryLedgerIdempotencyStore();
    let created = 0;
    const createEntry = async () => {
      created += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return entry('entry-shared', userA, hotel1);
    };
    const getEntry = async (id: string) => entry(id, userA, hotel1);

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
    assert.equal(first.entry.id, 'entry-shared');
    assert.equal(second.entry.id, 'entry-shared');
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
});
