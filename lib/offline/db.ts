'use client';

export type OfflineQueueStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'needs_review';

export type OfflineQueueType =
  | 'reservation_draft'
  | 'payment_draft'
  | 'charge_draft'
  | 'cash_count_draft';

export type OfflineQueueItem<TPayload = Record<string, unknown>> = {
  id: string;
  type: OfflineQueueType;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
  status: OfflineQueueStatus;
  error: string | null;
  serverId: string | null;
  retryCount: number;
  reviewedAt?: string | null;
};

export type OfflinePrintSnapshot = {
  id: string;
  title: string;
  hotelName?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const dbName = 'hotel_ops_offline';
const dbVersion = 1;

export const offlineStores = {
  reservations: 'offline_reservation_drafts',
  payments: 'offline_payment_drafts',
  charges: 'offline_charge_drafts',
  cashCounts: 'offline_cash_count_drafts',
  snapshots: 'offline_print_snapshots',
  queue: 'sync_queue'
} as const;

const queueMirrorStore: Record<OfflineQueueType, string> = {
  reservation_draft: offlineStores.reservations,
  payment_draft: offlineStores.payments,
  charge_draft: offlineStores.charges,
  cash_count_draft: offlineStores.cashCounts
};

let dbPromise: Promise<IDBDatabase> | null = null;

function localId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function notifyOfflineStoreChanged() {
  window.dispatchEvent(new Event('offline-store-changed'));
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
  });
}

export function openOfflineDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('Offline storage is not available in this browser.'));
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(dbName, dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;
        Object.values(offlineStores).forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open offline storage.'));
    });
  }

  return dbPromise;
}

export async function queueOfflineItem<TPayload extends Record<string, unknown>>(
  type: OfflineQueueType,
  payload: TPayload
) {
  const db = await openOfflineDb();
  const now = new Date().toISOString();
  const item: OfflineQueueItem<TPayload> = {
    id: localId(),
    type,
    payload,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    error: null,
    serverId: null,
    retryCount: 0
  };

  const mirrorStore = queueMirrorStore[type];
  const transaction = db.transaction([offlineStores.queue, mirrorStore], 'readwrite');
  transaction.objectStore(offlineStores.queue).put(item);
  transaction.objectStore(mirrorStore).put(item);
  await transactionDone(transaction);
  notifyOfflineStoreChanged();
  return item;
}

export async function getQueueItems() {
  const db = await openOfflineDb();
  const items = await requestToPromise<OfflineQueueItem[]>(
    db.transaction(offlineStores.queue, 'readonly').objectStore(offlineStores.queue).getAll()
  );

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPendingSyncCount() {
  const items = await getQueueItems();
  return items.filter((item) => item.status === 'pending' || item.status === 'failed').length;
}

export async function updateQueueItem(item: OfflineQueueItem) {
  const db = await openOfflineDb();
  const mirrorStore = queueMirrorStore[item.type];
  const updated = { ...item, updatedAt: new Date().toISOString() };
  const transaction = db.transaction([offlineStores.queue, mirrorStore], 'readwrite');
  transaction.objectStore(offlineStores.queue).put(updated);
  transaction.objectStore(mirrorStore).put(updated);
  await transactionDone(transaction);
  notifyOfflineStoreChanged();
  return updated;
}

export async function updateQueueItemStatus(
  item: OfflineQueueItem,
  status: OfflineQueueStatus,
  options: { error?: string | null; serverId?: string | null; incrementRetry?: boolean } = {}
) {
  return updateQueueItem({
    ...item,
    status,
    error: options.error ?? null,
    serverId: options.serverId ?? item.serverId,
    retryCount: item.retryCount + (options.incrementRetry ? 1 : 0)
  });
}

export async function deleteQueueItem(item: OfflineQueueItem) {
  const db = await openOfflineDb();
  const mirrorStore = queueMirrorStore[item.type];
  const transaction = db.transaction([offlineStores.queue, mirrorStore], 'readwrite');
  transaction.objectStore(offlineStores.queue).delete(item.id);
  transaction.objectStore(mirrorStore).delete(item.id);
  await transactionDone(transaction);
  notifyOfflineStoreChanged();
}

export async function savePrintSnapshot(snapshot: Omit<OfflinePrintSnapshot, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = await openOfflineDb();
  const now = new Date().toISOString();
  const item: OfflinePrintSnapshot = {
    ...snapshot,
    id: localId(),
    createdAt: now,
    updatedAt: now
  };
  await requestToPromise(db.transaction(offlineStores.snapshots, 'readwrite').objectStore(offlineStores.snapshots).put(item));
  notifyOfflineStoreChanged();
  return item;
}

export async function getPrintSnapshots() {
  const db = await openOfflineDb();
  const snapshots = await requestToPromise<OfflinePrintSnapshot[]>(
    db.transaction(offlineStores.snapshots, 'readonly').objectStore(offlineStores.snapshots).getAll()
  );
  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deletePrintSnapshot(id: string) {
  const db = await openOfflineDb();
  await requestToPromise(db.transaction(offlineStores.snapshots, 'readwrite').objectStore(offlineStores.snapshots).delete(id));
  notifyOfflineStoreChanged();
}
