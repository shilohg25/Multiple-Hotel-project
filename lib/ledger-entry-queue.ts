import { fetchWithTimeout, isNetworkError, RequestTimeoutError } from './fetch-timeout.ts';

export const LEDGER_SAVE_TIMEOUT_MS = 12_000;
export const LEDGER_QUEUE_STORAGE_KEY = 'hotel_ops_ledger_entry_queue';
export const LEDGER_NETWORK_ERROR = "Couldn't save this entry. Check your connection and try again.";
export const LEDGER_TIMEOUT_ERROR = "Couldn't save this entry. The request timed out. Check your connection and try again.";
export const LEDGER_QUEUE_HINT = "It's saved on this device and will be sent when you're back online.";
export const LEDGER_NEEDS_ATTENTION_ERROR = "This entry is still saved on this device but could not be sent. Sign in with the same account and try again.";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type LedgerQueueStatus = 'pending' | 'syncing' | 'failed' | 'needs_attention';

export type LedgerQueueItem = {
  clientRequestId: string;
  userId: string;
  hotelId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: LedgerQueueStatus;
  error: string | null;
};

export type PostLedgerSuccess = {
  ok: true;
  entry: unknown;
  duplicate: boolean;
  clientRequestId: string;
};

export type PostLedgerFailure = {
  ok: false;
  error: string;
  retryable: boolean;
  needsAttention?: boolean;
  status?: number;
  clientRequestId: string;
};

export type PostLedgerResult = PostLedgerSuccess | PostLedgerFailure;

export type SyncLedgerQueueResult = {
  processed: number;
  synced: number;
  failed: number;
  lastError: string | null;
};

export function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

export function createLedgerClientRequestId(randomUUID: () => string = defaultRandomUUID): string {
  return randomUUID();
}

function defaultRandomUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ledger_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function ledgerQueueStorageKey(userId: string) {
  return `${LEDGER_QUEUE_STORAGE_KEY}:${userId}`;
}

export function buildLedgerPayload(
  formValues: Record<string, unknown>,
  options: { outletId?: string | null; clientRequestId: string; hotelId?: string }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(formValues)) {
    if (value !== undefined) payload[key] = value;
  }
  if (payload.category === 'collectible') payload.is_collectible = 'true';
  if (options.outletId) payload.outlet_id = options.outletId;
  if (options.hotelId && !payload.hotel_id) payload.hotel_id = options.hotelId;
  payload.client_request_id = options.clientRequestId;
  return payload;
}

export function ledgerSaveFailureMessage(error: unknown): string {
  if (error instanceof RequestTimeoutError) return LEDGER_TIMEOUT_ERROR;
  return LEDGER_NETWORK_ERROR;
}

export function isRetryableLedgerStatus(status: number | undefined): boolean {
  if (status == null) return true;
  if (status >= 500) return true;
  return status === 408 || status === 429;
}

export function isLedgerAuthFailure(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

export function readLedgerQueue(storage: StorageLike, userId: string): LedgerQueueItem[] {
  const raw = storage.getItem(ledgerQueueStorageKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => isLedgerQueueItem(item) && item.userId === userId);
  } catch {
    return [];
  }
}

export function writeLedgerQueue(storage: StorageLike, userId: string, items: LedgerQueueItem[]) {
  storage.setItem(ledgerQueueStorageKey(userId), JSON.stringify(items.filter((item) => item.userId === userId)));
}

export function upsertLedgerQueueItem(storage: StorageLike, userId: string, item: LedgerQueueItem) {
  const owned = { ...item, userId };
  const items = readLedgerQueue(storage, userId);
  const index = items.findIndex((entry) => entry.clientRequestId === owned.clientRequestId);
  if (index >= 0) items[index] = owned;
  else items.push(owned);
  writeLedgerQueue(storage, userId, items);
  return owned;
}

export function removeLedgerQueueItem(storage: StorageLike, userId: string, clientRequestId: string) {
  writeLedgerQueue(
    storage,
    userId,
    readLedgerQueue(storage, userId).filter((item) => item.clientRequestId !== clientRequestId)
  );
}

export function pendingLedgerEntries(storage: StorageLike, userId: string): LedgerQueueItem[] {
  return readLedgerQueue(storage, userId)
    .filter((item) => item.status === 'pending' || item.status === 'failed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function needsAttentionLedgerEntries(storage: StorageLike, userId: string): LedgerQueueItem[] {
  return readLedgerQueue(storage, userId)
    .filter((item) => item.status === 'needs_attention')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function retryableLedgerEntries(storage: StorageLike, userId: string): LedgerQueueItem[] {
  return readLedgerQueue(storage, userId)
    .filter((item) => item.status === 'pending' || item.status === 'failed' || item.status === 'needs_attention')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function resetStaleSyncingLedgerEntries(storage: StorageLike, userId: string) {
  const items = readLedgerQueue(storage, userId);
  let changed = false;
  const reset = items.map((item) => {
    if (item.status !== 'syncing') return item;
    changed = true;
    return { ...item, status: 'pending' as const, error: item.error };
  });
  if (changed) writeLedgerQueue(storage, userId, reset);
  return reset.filter((item) => item.status === 'pending' || item.status === 'failed');
}

function isLedgerQueueItem(value: unknown): value is LedgerQueueItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<LedgerQueueItem>;
  return typeof item.clientRequestId === 'string'
    && item.clientRequestId.trim().length > 0
    && typeof item.userId === 'string'
    && item.userId.trim().length > 0
    && typeof item.hotelId === 'string'
    && !!item.payload
    && typeof item.payload === 'object'
    && typeof item.createdAt === 'string';
}

function errorMessageFromJson(json: unknown, fallback: string) {
  if (json && typeof json === 'object' && 'error' in json) {
    const error = (json as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
  }
  return fallback;
}

export function hotelIdFromLedgerValues(formValues: Record<string, unknown>, hotelId?: string) {
  const fromValues = formValues.hotel_id;
  if (typeof fromValues === 'string' && fromValues.trim()) return fromValues;
  if (hotelId && hotelId.trim()) return hotelId;
  return '';
}

export async function postLedgerEntry(
  payload: Record<string, unknown>,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<Omit<PostLedgerSuccess, 'clientRequestId'> | Omit<PostLedgerFailure, 'clientRequestId'>> {
  try {
    const response = await fetchWithTimeout('/api/ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, {
      timeoutMs: options.timeoutMs ?? LEDGER_SAVE_TIMEOUT_MS,
      fetchImpl: options.fetchImpl
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const needsAttention = isLedgerAuthFailure(response.status);
      return {
        ok: false,
        error: errorMessageFromJson(json, needsAttention ? LEDGER_NEEDS_ATTENTION_ERROR : 'Unable to save ledger entry.'),
        retryable: isRetryableLedgerStatus(response.status),
        needsAttention,
        status: response.status
      };
    }
    const record = json && typeof json === 'object' ? json as { entry?: unknown; duplicate?: unknown } : {};
    return {
      ok: true,
      entry: record.entry ?? json,
      duplicate: record.duplicate === true
    };
  } catch (error) {
    return {
      ok: false,
      error: ledgerSaveFailureMessage(error),
      retryable: isNetworkError(error)
    };
  }
}

export async function saveLedgerEntryWithQueue(
  formValues: Record<string, unknown>,
  options: {
    clientRequestId?: string;
    outletId?: string | null;
    userId: string;
    hotelId?: string;
    storage: StorageLike;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    createId?: () => string;
    now?: () => string;
  }
): Promise<PostLedgerResult> {
  const clientRequestId = options.clientRequestId || createLedgerClientRequestId(options.createId);
  const hotelId = hotelIdFromLedgerValues(formValues, options.hotelId);
  const payload = buildLedgerPayload(formValues, {
    outletId: options.outletId,
    clientRequestId,
    hotelId
  });
  const existing = readLedgerQueue(options.storage, options.userId).find((item) => item.clientRequestId === clientRequestId);
  const baseItem: LedgerQueueItem = {
    clientRequestId,
    userId: options.userId,
    hotelId: existing?.hotelId || hotelId,
    payload,
    createdAt: existing?.createdAt || (options.now ? options.now() : new Date().toISOString()),
    status: 'pending',
    error: null
  };
  upsertLedgerQueueItem(options.storage, options.userId, baseItem);
  upsertLedgerQueueItem(options.storage, options.userId, { ...baseItem, status: 'syncing' });

  const result = await postLedgerEntry(payload, {
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl
  });

  if (result.ok) {
    removeLedgerQueueItem(options.storage, options.userId, clientRequestId);
    return { ...result, clientRequestId };
  }

  if (result.needsAttention) {
    upsertLedgerQueueItem(options.storage, options.userId, {
      ...baseItem,
      status: 'needs_attention',
      error: result.error || LEDGER_NEEDS_ATTENTION_ERROR
    });
  } else if (result.retryable) {
    upsertLedgerQueueItem(options.storage, options.userId, {
      ...baseItem,
      status: 'failed',
      error: result.error
    });
  } else {
    removeLedgerQueueItem(options.storage, options.userId, clientRequestId);
  }

  return { ...result, clientRequestId };
}

export async function syncPendingLedgerEntries(options: {
  storage: StorageLike;
  userId: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
}): Promise<SyncLedgerQueueResult> {
  if (options.isOnline && !options.isOnline()) {
    return { processed: 0, synced: 0, failed: 0, lastError: LEDGER_NETWORK_ERROR };
  }

  resetStaleSyncingLedgerEntries(options.storage, options.userId);
  const result: SyncLedgerQueueResult = { processed: 0, synced: 0, failed: 0, lastError: null };

  for (const item of pendingLedgerEntries(options.storage, options.userId)) {
    result.processed += 1;
    const saved = await saveLedgerEntryWithQueue(item.payload, {
      clientRequestId: item.clientRequestId,
      userId: options.userId,
      hotelId: item.hotelId,
      storage: options.storage,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
      now: () => item.createdAt
    });
    if (saved.ok) result.synced += 1;
    else {
      result.failed += 1;
      result.lastError = saved.error;
    }
  }

  return result;
}

export function queuedLedgerHint(error: string, retryable: boolean, needsAttention = false) {
  if (needsAttention) {
    if (error.includes(LEDGER_NEEDS_ATTENTION_ERROR)) return error;
    return `${error} ${LEDGER_NEEDS_ATTENTION_ERROR}`.trim();
  }
  if (!retryable) return error;
  return `${error} ${LEDGER_QUEUE_HINT}`;
}
