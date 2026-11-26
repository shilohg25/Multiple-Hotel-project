import { fetchWithTimeout, isNetworkError, RequestTimeoutError } from './fetch-timeout.ts';

export const LEDGER_SAVE_TIMEOUT_MS = 12_000;
export const LEDGER_QUEUE_STORAGE_KEY = 'hotel_ops_ledger_entry_queue';
export const LEDGER_NETWORK_ERROR = "Couldn't save this entry. Check your connection and try again.";
export const LEDGER_TIMEOUT_ERROR = "Couldn't save this entry. The request timed out. Check your connection and try again.";
export const LEDGER_QUEUE_HINT = "It's saved on this device and will be sent when you're back online.";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type LedgerQueueStatus = 'pending' | 'syncing' | 'failed';

export type LedgerQueueItem = {
  clientRequestId: string;
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

export function buildLedgerPayload(
  formValues: Record<string, unknown>,
  options: { outletId?: string | null; clientRequestId: string }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(formValues)) {
    if (value !== undefined) payload[key] = value;
  }
  if (payload.category === 'collectible') payload.is_collectible = 'true';
  if (options.outletId) payload.outlet_id = options.outletId;
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

export function readLedgerQueue(storage: StorageLike): LedgerQueueItem[] {
  const raw = storage.getItem(LEDGER_QUEUE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLedgerQueueItem);
  } catch {
    return [];
  }
}

export function writeLedgerQueue(storage: StorageLike, items: LedgerQueueItem[]) {
  storage.setItem(LEDGER_QUEUE_STORAGE_KEY, JSON.stringify(items));
}

export function upsertLedgerQueueItem(storage: StorageLike, item: LedgerQueueItem) {
  const items = readLedgerQueue(storage);
  const index = items.findIndex((entry) => entry.clientRequestId === item.clientRequestId);
  if (index >= 0) items[index] = item;
  else items.push(item);
  writeLedgerQueue(storage, items);
  return item;
}

export function removeLedgerQueueItem(storage: StorageLike, clientRequestId: string) {
  writeLedgerQueue(
    storage,
    readLedgerQueue(storage).filter((item) => item.clientRequestId !== clientRequestId)
  );
}

export function pendingLedgerEntries(storage: StorageLike): LedgerQueueItem[] {
  return readLedgerQueue(storage)
    .filter((item) => item.status === 'pending' || item.status === 'failed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function isLedgerQueueItem(value: unknown): value is LedgerQueueItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<LedgerQueueItem>;
  return typeof item.clientRequestId === 'string'
    && item.clientRequestId.trim().length > 0
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
      return {
        ok: false,
        error: errorMessageFromJson(json, 'Unable to save ledger entry.'),
        retryable: isRetryableLedgerStatus(response.status),
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
    storage: StorageLike;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    createId?: () => string;
    now?: () => string;
  }
): Promise<PostLedgerResult> {
  const clientRequestId = options.clientRequestId || createLedgerClientRequestId(options.createId);
  const payload = buildLedgerPayload(formValues, {
    outletId: options.outletId,
    clientRequestId
  });
  const existing = readLedgerQueue(options.storage).find((item) => item.clientRequestId === clientRequestId);
  const queued: LedgerQueueItem = {
    clientRequestId,
    payload,
    createdAt: existing?.createdAt || (options.now ? options.now() : new Date().toISOString()),
    status: 'syncing',
    error: null
  };
  upsertLedgerQueueItem(options.storage, queued);

  const result = await postLedgerEntry(payload, {
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl
  });

  if (result.ok) {
    removeLedgerQueueItem(options.storage, clientRequestId);
    return { ...result, clientRequestId };
  }

  if (result.retryable) {
    upsertLedgerQueueItem(options.storage, {
      ...queued,
      status: 'failed',
      error: result.error
    });
  } else {
    removeLedgerQueueItem(options.storage, clientRequestId);
  }

  return { ...result, clientRequestId };
}

export async function syncPendingLedgerEntries(options: {
  storage: StorageLike;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
}): Promise<SyncLedgerQueueResult> {
  if (options.isOnline && !options.isOnline()) {
    return { processed: 0, synced: 0, failed: 0, lastError: LEDGER_NETWORK_ERROR };
  }

  const result: SyncLedgerQueueResult = { processed: 0, synced: 0, failed: 0, lastError: null };

  for (const item of pendingLedgerEntries(options.storage)) {
    result.processed += 1;
    const saved = await saveLedgerEntryWithQueue(item.payload, {
      clientRequestId: item.clientRequestId,
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

export function queuedLedgerHint(error: string, retryable: boolean) {
  if (!retryable) return error;
  return `${error} ${LEDGER_QUEUE_HINT}`;
}
