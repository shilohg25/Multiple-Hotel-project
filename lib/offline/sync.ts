'use client';

import {
  getQueueItems,
  updateQueueItemStatus,
  type OfflineQueueItem
} from './db';

export type SyncResult = {
  processed: number;
  synced: number;
  failed: number;
  needsReview: number;
};

function payloadObject(item: OfflineQueueItem) {
  return (item.payload || {}) as Record<string, unknown>;
}

function errorMessageFromJson(json: unknown, fallback: string) {
  if (json && typeof json === 'object' && 'error' in json) {
    const error = (json as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
  }
  return fallback;
}

function isNeedsReview(status: number, message: string) {
  const lower = message.toLowerCase();
  return status === 409 ||
    lower.includes('conflict') ||
    lower.includes('already has') ||
    lower.includes('duplicate') ||
    lower.includes('review');
}

function serverIdFrom(type: OfflineQueueItem['type'], json: Record<string, unknown>) {
  if (type === 'reservation_draft') {
    return (json.reservation as { id?: string } | undefined)?.id || null;
  }
  if (type === 'payment_draft') {
    return (json.payment as { id?: string } | undefined)?.id || null;
  }
  if (type === 'charge_draft') {
    return (json.charge as { id?: string } | undefined)?.id || null;
  }
  if (type === 'cash_count_draft') {
    return typeof json.server_id === 'string' ? json.server_id : null;
  }
  return null;
}

async function syncReservationDraft(item: OfflineQueueItem) {
  const payload = payloadObject(item);
  return fetch('/api/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      status: 'tentative',
      client_request_id: item.id
    })
  });
}

async function syncPaymentDraft(item: OfflineQueueItem) {
  const payload = payloadObject(item);
  const form = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (key === 'proof') return;
    if (value !== undefined && value !== null) form.set(key, String(value));
  });

  const proof = payload.proof;
  if (proof instanceof Blob) {
    form.set('proof', proof, (payload.proofName as string | undefined) || 'offline-proof');
  }
  form.set('client_request_id', item.id);

  return fetch('/api/payments', {
    method: 'POST',
    body: form
  });
}

async function syncChargeDraft(item: OfflineQueueItem) {
  const payload = payloadObject(item);
  const reservationId = String(payload.reservation_id || '');
  return fetch(`/api/reservations/${reservationId}/charges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      client_request_id: item.id
    })
  });
}

async function syncCashCountDraft(item: OfflineQueueItem) {
  const payload = payloadObject(item);
  return fetch('/api/cash-counts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      offline_sync: true,
      client_request_id: item.id
    })
  });
}

async function syncSingleItem(item: OfflineQueueItem) {
  await updateQueueItemStatus(item, 'syncing');

  let response: Response;
  if (item.type === 'reservation_draft') response = await syncReservationDraft(item);
  else if (item.type === 'payment_draft') response = await syncPaymentDraft(item);
  else if (item.type === 'charge_draft') response = await syncChargeDraft(item);
  else response = await syncCashCountDraft(item);

  const json = await response.json().catch(() => ({}));
  const normalizedJson = json && typeof json === 'object' ? json as Record<string, unknown> : {};

  if (!response.ok) {
    const message = errorMessageFromJson(json, 'Sync failed. Please review this item.');
    const nextStatus = isNeedsReview(response.status, message) ? 'needs_review' : 'failed';
    await updateQueueItemStatus(item, nextStatus, {
      error: message,
      incrementRetry: true
    });
    return nextStatus;
  }

  await updateQueueItemStatus(item, 'synced', {
    serverId: serverIdFrom(item.type, normalizedJson)
  });
  return 'synced';
}

export async function syncOfflineQueue(): Promise<SyncResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are offline. Reconnect before syncing.');
  }

  const items = await getQueueItems();
  const syncable = items
    .filter((item) => item.status === 'pending' || item.status === 'failed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const result: SyncResult = { processed: 0, synced: 0, failed: 0, needsReview: 0 };

  for (const item of syncable) {
    result.processed += 1;
    try {
      const status = await syncSingleItem(item);
      if (status === 'synced') result.synced += 1;
      else if (status === 'needs_review') result.needsReview += 1;
      else result.failed += 1;
    } catch (error) {
      await updateQueueItemStatus(item, 'failed', {
        error: error instanceof Error ? error.message : 'Sync failed.',
        incrementRetry: true
      });
      result.failed += 1;
    }
  }

  return result;
}
