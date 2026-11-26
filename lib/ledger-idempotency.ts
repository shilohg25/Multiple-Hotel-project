import { createHash } from 'node:crypto';

export const LEDGER_IDEMPOTENCY_TYPE = 'ledger_entry.create';
export const LEDGER_IDEMPOTENCY_IN_PROGRESS = 'This entry is still being saved. Please try again in a moment.';
export const LEDGER_RESERVATION_STALE_MS = 120_000;
/** A client_request_id staff replaced with a corrected entry. A late copy of it is refused, never saved. */
export const LEDGER_RETIRED_STATUS = 'retired';
export const LEDGER_REPLACED_ERROR = 'This entry was replaced by a corrected one, so it was not saved.';

export type OfflineSyncRow = {
  client_request_id: string;
  request_type: string;
  server_table: string | null;
  server_id: string | null;
  status: string;
  created_by: string | null;
  created_at?: string | null;
};

export type LedgerEntryRecord = {
  id: string;
  hotel_id: string;
  created_by?: string | null;
  [key: string]: unknown;
};

export type LedgerReclaimResult =
  | { status: 'reclaimed'; serverId: string | null }
  | { status: 'busy' };

export type LedgerIdempotencyStore = {
  tryReserve(input: { clientRequestId: string; requestType: string; createdBy: string }): Promise<'reserved' | 'exists'>;
  get(clientRequestId: string): Promise<OfflineSyncRow | null>;
  assignServerId(input: { clientRequestId: string; serverId: string; createdBy: string; serverTable?: string }): Promise<void>;
  complete(input: { clientRequestId: string; serverId: string; createdBy: string; serverTable?: string }): Promise<void>;
  release(input: { clientRequestId: string; createdBy: string }): Promise<void>;
  tryReclaim(input: { clientRequestId: string; createdBy: string; olderThan: string; now?: string }): Promise<LedgerReclaimResult>;
  /** Atomically claim an unused id as retired (one insert; the unique key decides). */
  tryRetire(input: { clientRequestId: string; requestType: string; createdBy: string }): Promise<'retired' | 'exists'>;
  /** Retire an owned reservation that went stale without an entry. True when this call retired it. */
  markRetired(input: { clientRequestId: string; createdBy: string; olderThan: string }): Promise<boolean>;
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

function defaultNow() {
  return new Date();
}

function defaultRandomUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ledger_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createMemoryLedgerIdempotencyStore(
  initial: OfflineSyncRow[] = [],
  options: { now?: () => Date } = {}
): LedgerIdempotencyStore {
  const rows = new Map<string, OfflineSyncRow>();
  for (const row of initial) rows.set(row.client_request_id, { ...row });
  const clock = options.now ?? defaultNow;

  function isOpenReservation(row: OfflineSyncRow) {
    return row.status === 'reserved' || row.status === 'reclaiming';
  }

  return {
    async tryReserve(input) {
      if (rows.has(input.clientRequestId)) return 'exists';
      rows.set(input.clientRequestId, {
        client_request_id: input.clientRequestId,
        request_type: input.requestType,
        server_table: null,
        server_id: null,
        status: 'reserved',
        created_by: input.createdBy,
        created_at: clock().toISOString()
      });
      return 'reserved';
    },
    async get(clientRequestId) {
      const row = rows.get(clientRequestId);
      return row ? { ...row } : null;
    },
    async assignServerId(input) {
      const row = rows.get(input.clientRequestId);
      if (!row || row.created_by !== input.createdBy) return;
      if (row.status === 'processed') return;
      if (row.server_id) return;
      rows.set(input.clientRequestId, {
        ...row,
        server_id: input.serverId,
        server_table: input.serverTable || 'ledger_entries'
      });
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
      if (row.status === 'processed') return;
      if (!isOpenReservation(row)) return;
      rows.delete(input.clientRequestId);
    },
    async tryRetire(input) {
      if (rows.has(input.clientRequestId)) return 'exists';
      rows.set(input.clientRequestId, {
        client_request_id: input.clientRequestId,
        request_type: input.requestType,
        server_table: null,
        server_id: null,
        status: LEDGER_RETIRED_STATUS,
        created_by: input.createdBy,
        created_at: clock().toISOString()
      });
      return 'retired';
    },
    async markRetired(input) {
      const row = rows.get(input.clientRequestId);
      if (!row || row.created_by !== input.createdBy) return false;
      if (!isOpenReservation(row)) return false;
      if (!row.created_at || row.created_at >= input.olderThan) return false;
      rows.set(input.clientRequestId, { ...row, status: LEDGER_RETIRED_STATUS });
      return true;
    },
    async tryReclaim(input) {
      const row = rows.get(input.clientRequestId);
      if (!row || row.created_by !== input.createdBy) return { status: 'busy' };
      if (!isOpenReservation(row)) return { status: 'busy' };
      if (!row.created_at || row.created_at >= input.olderThan) return { status: 'busy' };
      const now = input.now || clock().toISOString();
      rows.set(input.clientRequestId, {
        ...row,
        status: 'reclaiming',
        created_at: now
      });
      return { status: 'reclaimed', serverId: row.server_id };
    }
  };
}

export type WaitForOwnedResult =
  | { status: 'ready'; serverId: string }
  | { status: 'denied' }
  | { status: 'pending' };

export async function waitForOwnedProcessedServerId(
  store: LedgerIdempotencyStore,
  input: {
    scopedId: string;
    userId: string;
    getEntry?: (id: string) => Promise<LedgerEntryRecord | null>;
  },
  options: { sleep?: (ms: number) => Promise<void>; attempts?: number; delayMs?: number } = {}
): Promise<WaitForOwnedResult> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 30;
  const delayMs = options.delayMs ?? 50;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const row = await store.get(input.scopedId);
    if (row && row.created_by !== input.userId) return { status: 'denied' };
    if (row?.server_id) {
      if (row.status === 'processed') return { status: 'ready', serverId: row.server_id };
      if (input.getEntry) {
        const entry = await input.getEntry(row.server_id);
        if (entry) return { status: 'ready', serverId: row.server_id };
      } else {
        return { status: 'ready', serverId: row.server_id };
      }
    }
    if (attempt + 1 < attempts) await sleep(delayMs);
  }
  return { status: 'pending' };
}

function isReservationStale(row: OfflineSyncRow | null, olderThan: string) {
  if (!row || row.status === 'processed') return false;
  if (row.status !== 'reserved' && row.status !== 'reclaiming') return false;
  return Boolean(row.created_at && row.created_at < olderThan);
}

async function markProcessed(
  store: LedgerIdempotencyStore,
  input: { clientRequestId: string; serverId: string; createdBy: string }
) {
  try {
    await store.complete({ ...input, serverTable: 'ledger_entries' });
  } catch {
    try {
      await store.complete({ ...input, serverTable: 'ledger_entries' });
    } catch {
      // Leave the reserved/reclaiming row with server_id set so a later
      // request can find the already-inserted entry and mark it processed.
    }
  }
}

export async function createLedgerEntryOnce(input: {
  userId: string;
  hotelId: string;
  clientRequestId: string | null;
  store: LedgerIdempotencyStore;
  createEntry: (id?: string) => Promise<LedgerEntryRecord>;
  getEntry: (id: string) => Promise<LedgerEntryRecord | null>;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  delayMs?: number;
  now?: () => Date;
  staleMs?: number;
  randomUUID?: () => string;
}): Promise<CreateLedgerOnceResult> {
  if (!input.clientRequestId) {
    return { ok: true, entry: await input.createEntry(), duplicate: false };
  }

  const scopedId = scopedLedgerRequestId(input.userId, input.hotelId, input.clientRequestId);
  const now = input.now ?? defaultNow;
  const staleMs = input.staleMs ?? LEDGER_RESERVATION_STALE_MS;
  const randomUUID = input.randomUUID ?? defaultRandomUUID;
  const waitOptions = {
    sleep: input.sleep,
    attempts: input.attempts,
    delayMs: input.delayMs
  };

  async function ownedEntry(serverId: string | null | undefined) {
    if (!serverId) return null;
    const row = await input.store.get(scopedId);
    const entry = await input.getEntry(serverId);
    if (!mayReturnLedgerDuplicate(row, entry, input.userId, input.hotelId) || !entry) return null;
    return entry;
  }

  async function finishReservedInsert(): Promise<CreateLedgerOnceResult> {
    const current = await input.store.get(scopedId);
    const assignedId = current?.server_id || randomUUID();
    if (!current?.server_id) {
      await input.store.assignServerId({
        clientRequestId: scopedId,
        serverId: assignedId,
        createdBy: input.userId,
        serverTable: 'ledger_entries'
      });
    }
    const serverId = (await input.store.get(scopedId))?.server_id || assignedId;
    const existing = await ownedEntry(serverId);
    if (existing) {
      await markProcessed(input.store, { clientRequestId: scopedId, serverId: existing.id, createdBy: input.userId });
      return { ok: true, entry: existing, duplicate: true };
    }

    try {
      const entry = await input.createEntry(serverId);
      await markProcessed(input.store, { clientRequestId: scopedId, serverId: entry.id, createdBy: input.userId });
      return { ok: true, entry, duplicate: false };
    } catch (error) {
      const found = await ownedEntry(serverId);
      if (found) {
        await markProcessed(input.store, { clientRequestId: scopedId, serverId: found.id, createdBy: input.userId });
        return { ok: true, entry: found, duplicate: true };
      }
      await input.store.release({ clientRequestId: scopedId, createdBy: input.userId });
      throw error;
    }
  }

  async function waitForDuplicate(): Promise<CreateLedgerOnceResult | null> {
    const waited = await waitForOwnedProcessedServerId(input.store, {
      scopedId,
      userId: input.userId,
      getEntry: input.getEntry
    }, waitOptions);

    if (waited.status === 'denied') {
      return { ok: false, error: 'Hotel access denied.', status: 403 };
    }
    if (waited.status === 'ready') {
      const entry = await ownedEntry(waited.serverId);
      if (entry) {
        await markProcessed(input.store, { clientRequestId: scopedId, serverId: entry.id, createdBy: input.userId });
        return { ok: true, entry, duplicate: true };
      }
      const row = await input.store.get(scopedId);
      if (row && row.created_by !== input.userId) {
        return { ok: false, error: 'Hotel access denied.', status: 403 };
      }
    }
    return null;
  }

  const reservation = await input.store.tryReserve({
    clientRequestId: scopedId,
    requestType: LEDGER_IDEMPOTENCY_TYPE,
    createdBy: input.userId
  });

  if (reservation === 'reserved') {
    return finishReservedInsert();
  }

  async function reclaimIfStale(row: OfflineSyncRow | null) {
    const olderThan = new Date(now().getTime() - staleMs).toISOString();
    if (!isReservationStale(row, olderThan)) return null;
    const reclaim = await input.store.tryReclaim({
      clientRequestId: scopedId,
      createdBy: input.userId,
      olderThan,
      now: now().toISOString()
    });
    if (reclaim.status === 'reclaimed') {
      return finishReservedInsert();
    }
    return waitForDuplicate();
  }

  const row = await input.store.get(scopedId);
  if (row && row.created_by !== input.userId) {
    return { ok: false, error: 'Hotel access denied.', status: 403 };
  }
  if (row?.status === LEDGER_RETIRED_STATUS) {
    return { ok: false, error: LEDGER_REPLACED_ERROR, status: 410 };
  }
  if (row?.server_id) {
    const found = await ownedEntry(row.server_id);
    if (found) {
      await markProcessed(input.store, { clientRequestId: scopedId, serverId: found.id, createdBy: input.userId });
      return { ok: true, entry: found, duplicate: true };
    }
  }

  const reclaimed = await reclaimIfStale(row);
  if (reclaimed) return reclaimed;

  const existing = await waitForDuplicate();
  if (existing) return existing;

  const rowAfterWait = await input.store.get(scopedId);
  if (rowAfterWait?.status === LEDGER_RETIRED_STATUS && rowAfterWait.created_by === input.userId) {
    return { ok: false, error: LEDGER_REPLACED_ERROR, status: 410 };
  }
  const reclaimedAfterWait = await reclaimIfStale(rowAfterWait);
  if (reclaimedAfterWait) return reclaimedAfterWait;

  return { ok: false, error: LEDGER_IDEMPOTENCY_IN_PROGRESS, status: 409 };
}

export type RetireLedgerResult =
  | { status: 'retired' }
  | { status: 'already_saved'; entry: LedgerEntryRecord }
  | { status: 'busy' }
  | { status: 'denied' };

/**
 * "Replace with the corrected entry": decide what happened to an earlier client_request_id
 * without inserting, editing or deleting any ledger row.
 * - Never reached the server: claim the id as retired in one atomic insert. A late copy is refused (410).
 * - Already saved for this user and hotel: report it, so staff correct it with an adjustment.
 * - Still being saved right now: busy; staff try again in a moment.
 * - A reservation that went stale without an entry is retired, the same staleness rule as reclaim.
 */
export async function retireLedgerRequest(input: {
  userId: string;
  hotelId: string;
  clientRequestId: string;
  store: LedgerIdempotencyStore;
  getEntry: (id: string) => Promise<LedgerEntryRecord | null>;
  now?: () => Date;
  staleMs?: number;
}): Promise<RetireLedgerResult> {
  const scopedId = scopedLedgerRequestId(input.userId, input.hotelId, input.clientRequestId);
  const claimed = await input.store.tryRetire({ clientRequestId: scopedId, requestType: LEDGER_IDEMPOTENCY_TYPE, createdBy: input.userId });
  if (claimed === 'retired') return { status: 'retired' };

  const row = await input.store.get(scopedId);
  if (!row) return { status: 'busy' };
  if (row.created_by !== input.userId) return { status: 'denied' };
  if (row.status === LEDGER_RETIRED_STATUS) return { status: 'retired' };
  if (row.server_id) {
    const entry = await input.getEntry(row.server_id);
    if (entry && mayReturnLedgerDuplicate(row, entry, input.userId, input.hotelId)) return { status: 'already_saved', entry };
  }
  if (row.status === 'processed') return { status: 'busy' };
  const now = input.now ?? defaultNow;
  const olderThan = new Date(now().getTime() - (input.staleMs ?? LEDGER_RESERVATION_STALE_MS)).toISOString();
  if (await input.store.markRetired({ clientRequestId: scopedId, createdBy: input.userId, olderThan })) return { status: 'retired' };
  return { status: 'busy' };
}
