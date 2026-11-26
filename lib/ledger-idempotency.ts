import { createHash } from 'node:crypto';

export const LEDGER_IDEMPOTENCY_TYPE = 'ledger_entry.create';
export const LEDGER_IDEMPOTENCY_IN_PROGRESS = 'This entry is still being saved. Please try again in a moment.';

export type OfflineSyncRow = {
  client_request_id: string;
  request_type: string;
  server_table: string | null;
  server_id: string | null;
  status: string;
  created_by: string | null;
};

export type LedgerEntryRecord = {
  id: string;
  hotel_id: string;
  created_by?: string | null;
  [key: string]: unknown;
};

export type LedgerIdempotencyStore = {
  tryReserve(input: { clientRequestId: string; requestType: string; createdBy: string }): Promise<'reserved' | 'exists'>;
  get(clientRequestId: string): Promise<OfflineSyncRow | null>;
  complete(input: { clientRequestId: string; serverId: string; createdBy: string; serverTable?: string }): Promise<void>;
  release(input: { clientRequestId: string; createdBy: string }): Promise<void>;
};

export type CreateLedgerOnceSuccess = {
  ok: true;
  entry: LedgerEntryRecord;
  duplicate: boolean;
};

export type CreateLedgerOnceFailure = {
  ok: false;
  error: string;
  status: number;
};

export type CreateLedgerOnceResult = CreateLedgerOnceSuccess | CreateLedgerOnceFailure;

export function scopedLedgerRequestId(userId: string, hotelId: string, clientRequestId: string) {
  const digest = createHash('sha256')
    .update(`${LEDGER_IDEMPOTENCY_TYPE}:${userId}:${hotelId}:${clientRequestId}`)
    .digest('hex');
  return `led:${digest}`;
}

export function mayReturnLedgerDuplicate(
  row: OfflineSyncRow | null,
  entry: LedgerEntryRecord | null,
  userId: string,
  hotelId: string
) {
  if (!row || !entry) return false;
  if (row.created_by !== userId) return false;
  if (entry.hotel_id !== hotelId) return false;
  if (entry.created_by && entry.created_by !== userId) return false;
  return Boolean(row.server_id);
}

export function createMemoryLedgerIdempotencyStore(initial: OfflineSyncRow[] = []): LedgerIdempotencyStore {
  const rows = new Map<string, OfflineSyncRow>();
  for (const row of initial) rows.set(row.client_request_id, { ...row });

  return {
    async tryReserve(input) {
      if (rows.has(input.clientRequestId)) return 'exists';
      rows.set(input.clientRequestId, {
        client_request_id: input.clientRequestId,
        request_type: input.requestType,
        server_table: null,
        server_id: null,
        status: 'reserved',
        created_by: input.createdBy
      });
      return 'reserved';
    },
    async get(clientRequestId) {
      const row = rows.get(clientRequestId);
      return row ? { ...row } : null;
    },
    async complete(input) {
      const row = rows.get(input.clientRequestId);
      if (!row || row.created_by !== input.createdBy) return;
      rows.set(input.clientRequestId, {
        ...row,
        server_id: input.serverId,
        server_table: input.serverTable || 'ledger_entries',
        status: 'processed'
      });
    },
    async release(input) {
      const row = rows.get(input.clientRequestId);
      if (!row || row.created_by !== input.createdBy) return;
      if (row.status !== 'reserved' || row.server_id) return;
      rows.delete(input.clientRequestId);
    }
  };
}

export type WaitForOwnedResult =
  | { status: 'ready'; serverId: string }
  | { status: 'denied' }
  | { status: 'pending' };

export async function waitForOwnedProcessedServerId(
  store: LedgerIdempotencyStore,
  input: { scopedId: string; userId: string },
  options: { sleep?: (ms: number) => Promise<void>; attempts?: number; delayMs?: number } = {}
): Promise<WaitForOwnedResult> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 30;
  const delayMs = options.delayMs ?? 50;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const row = await store.get(input.scopedId);
    if (row && row.created_by !== input.userId) return { status: 'denied' };
    if (row?.server_id) return { status: 'ready', serverId: row.server_id };
    if (attempt + 1 < attempts) await sleep(delayMs);
  }
  return { status: 'pending' };
}

export async function createLedgerEntryOnce(input: {
  userId: string;
  hotelId: string;
  clientRequestId: string | null;
  store: LedgerIdempotencyStore;
  createEntry: () => Promise<LedgerEntryRecord>;
  getEntry: (id: string) => Promise<LedgerEntryRecord | null>;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  delayMs?: number;
}): Promise<CreateLedgerOnceResult> {
  if (!input.clientRequestId) {
    return { ok: true, entry: await input.createEntry(), duplicate: false };
  }

  const scopedId = scopedLedgerRequestId(input.userId, input.hotelId, input.clientRequestId);
  const reservation = await input.store.tryReserve({
    clientRequestId: scopedId,
    requestType: LEDGER_IDEMPOTENCY_TYPE,
    createdBy: input.userId
  });

  if (reservation === 'reserved') {
    try {
      const entry = await input.createEntry();
      await input.store.complete({
        clientRequestId: scopedId,
        serverId: entry.id,
        createdBy: input.userId,
        serverTable: 'ledger_entries'
      });
      return { ok: true, entry, duplicate: false };
    } catch (error) {
      await input.store.release({ clientRequestId: scopedId, createdBy: input.userId });
      throw error;
    }
  }

  const waited = await waitForOwnedProcessedServerId(input.store, {
    scopedId,
    userId: input.userId
  }, {
    sleep: input.sleep,
    attempts: input.attempts,
    delayMs: input.delayMs
  });

  if (waited.status === 'denied') {
    return { ok: false, error: 'Hotel access denied.', status: 403 };
  }
  if (waited.status !== 'ready') {
    return { ok: false, error: LEDGER_IDEMPOTENCY_IN_PROGRESS, status: 409 };
  }

  const entry = await input.getEntry(waited.serverId);
  const row = await input.store.get(scopedId);
  if (!mayReturnLedgerDuplicate(row, entry, input.userId, input.hotelId) || !entry) {
    return { ok: false, error: 'Hotel access denied.', status: 403 };
  }

  return { ok: true, entry, duplicate: true };
}
