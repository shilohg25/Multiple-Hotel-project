'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  deletePrintSnapshot,
  deleteQueueItem,
  getPrintSnapshots,
  getQueueItems,
  updateQueueItem,
  updateQueueItemStatus,
  type OfflinePrintSnapshot,
  type OfflineQueueItem
} from '@/lib/offline/db';
import { syncOfflineQueue } from '@/lib/offline/sync';

function stringifyPayload(value: unknown) {
  return JSON.stringify(
    value,
    (_key, nestedValue) => {
      if (nestedValue instanceof Blob) {
        return `[stored file: ${nestedValue instanceof File ? nestedValue.name : 'blob'}, ${Math.round(nestedValue.size / 1024)} KB]`;
      }
      return nestedValue;
    },
    2
  );
}

function statusClass(status: string) {
  if (status === 'synced') return 'bg-emerald-50 text-emerald-700';
  if (status === 'needs_review') return 'bg-amber-50 text-amber-800';
  if (status === 'failed') return 'bg-red-50 text-red-700';
  if (status === 'syncing') return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-700';
}

export function OfflineQueueManager() {
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [snapshots, setSnapshots] = useState<OfflinePrintSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState(false);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) || null,
    [selectedSnapshotId, snapshots]
  );
  const needsReviewItems = useMemo(() => queue.filter((item) => item.status === 'needs_review'), [queue]);

  async function load() {
    try {
      const [queueItems, snapshotItems] = await Promise.all([getQueueItems(), getPrintSnapshots()]);
      setQueue(queueItems);
      setSnapshots(snapshotItems);
      if (!selectedSnapshotId && snapshotItems[0]) setSelectedSnapshotId(snapshotItems[0].id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load offline queue.');
    }
  }

  useEffect(() => {
    void load();
    window.addEventListener('offline-store-changed', load);
    return () => window.removeEventListener('offline-store-changed', load);
  }, []);

  async function syncNow() {
    setMessage('');
    setSyncing(true);
    try {
      const result = await syncOfflineQueue();
      setMessage(`Sync complete: ${result.synced} synced, ${result.failed} failed, ${result.needsReview} need review.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function removeQueueItem(item: OfflineQueueItem) {
    if (!window.confirm('Delete this local offline item? This does not delete any server data.')) return;
    await deleteQueueItem(item);
    await load();
  }

  async function retryQueueItem(item: OfflineQueueItem) {
    setMessage('');
    setSyncing(true);
    try {
      await updateQueueItemStatus({ ...item, reviewedAt: null }, 'pending', { error: null });
      const result = await syncOfflineQueue();
      setMessage(`Sync complete: ${result.synced} synced, ${result.failed} failed, ${result.needsReview} need review.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Retry failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function markReviewed(item: OfflineQueueItem) {
    await updateQueueItem({
      ...item,
      reviewedAt: new Date().toISOString(),
      error: item.error ? `Reviewed locally. ${item.error}` : 'Reviewed locally.'
    });
    await load();
  }

  async function removeSnapshot(id: string) {
    if (!window.confirm('Delete this saved print snapshot from this browser?')) return;
    await deletePrintSnapshot(id);
    if (selectedSnapshotId === id) setSelectedSnapshotId(null);
    await load();
  }

  function printSelectedSnapshot() {
    window.setTimeout(() => window.print(), 50);
  }

  return (
    <div className="space-y-6">
      <section className="card p-5 print-hidden">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold">Offline limits</h2>
            <p className="mt-1 text-sm text-slate-500">
              Offline mode saves staff drafts and print snapshots only. Payments cannot be confirmed offline, bookings cannot be secured offline,
              and the server validates all room/date conflicts during sync.
            </p>
          </div>
          <button className="btn-primary print-hidden" type="button" disabled={syncing} onClick={() => void syncNow()}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
        {message ? <div className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
      </section>

      <section className="card overflow-hidden print-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold">Sync queue</h2>
          <p className="mt-1 text-sm text-slate-500">Conflicts and duplicate-looking items stay visible as Needs Review.</p>
        </div>
        {needsReviewItems.length ? (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
            <h3 className="font-bold text-amber-950">Needs Review</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {needsReviewItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                  <p className="font-semibold capitalize">{item.type.replaceAll('_', ' ')}</p>
                  <p className="mt-1 text-amber-900">{item.error || 'Server validation needs staff review.'}</p>
                  {item.reviewedAt ? <p className="mt-1 text-xs text-slate-500">Marked reviewed {new Date(item.reviewedAt).toLocaleString()}</p> : null}
                  <PayloadSummary item={item} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-secondary" type="button" disabled={syncing} onClick={() => void retryQueueItem(item)}>Retry Sync</button>
                    <button className="btn-secondary" type="button" onClick={() => void removeQueueItem(item)}>Delete Local Draft</button>
                    <button className="btn-secondary" type="button" onClick={() => void markReviewed(item)}>Mark Reviewed</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Server ID</th>
                <th className="px-5 py-3">Error</th>
                <th className="px-5 py-3">Payload</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queue.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3 font-semibold">{item.type.replaceAll('_', ' ')}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${statusClass(item.status)}`}>{item.status.replace('_', ' ')}</span>
                    {item.reviewedAt ? <p className="mt-1 text-xs text-slate-500">Reviewed</p> : null}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-600">{item.serverId || '-'}</td>
                  <td className="max-w-xs px-5 py-3 text-slate-600">{item.error || '-'}</td>
                  <td className="px-5 py-3">
                    <details>
                      <summary className="cursor-pointer font-semibold text-slate-700">View</summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{stringifyPayload(item.payload)}</pre>
                    </details>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      {item.status === 'needs_review' ? (
                        <>
                          <button className="btn-secondary" type="button" disabled={syncing} onClick={() => void retryQueueItem(item)}>Retry</button>
                          <button className="btn-secondary" type="button" onClick={() => void markReviewed(item)}>Mark reviewed</button>
                        </>
                      ) : null}
                      <button className="btn-secondary" type="button" onClick={() => void removeQueueItem(item)}>Delete local</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!queue.length ? <tr><td className="px-5 py-6 text-slate-500" colSpan={7}>No offline drafts in this browser.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5 print-hidden">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold">Saved print snapshots</h2>
            <p className="mt-1 text-sm text-slate-500">Snapshots are local to this browser and may not include the latest changes.</p>
          </div>
          <button className="btn-secondary" type="button" disabled={!selectedSnapshot} onClick={printSelectedSnapshot}>Print selected snapshot</button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            {snapshots.map((snapshot) => (
              <button
                key={snapshot.id}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedSnapshotId === snapshot.id ? 'border-slate-900 bg-slate-100' : 'border-slate-200'}`}
                type="button"
                onClick={() => setSelectedSnapshotId(snapshot.id)}
              >
                <span className="block font-semibold">{snapshot.title}</span>
                <span className="block text-xs text-slate-500">{new Date(snapshot.createdAt).toLocaleString()}</span>
              </button>
            ))}
            {!snapshots.length ? <p className="text-sm text-slate-500">No saved snapshots yet.</p> : null}
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            {selectedSnapshot ? (
              <div className="space-y-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <h3 className="font-bold">{selectedSnapshot.title}</h3>
                    <p className="text-sm text-slate-500">{selectedSnapshot.hotelName || 'Hotel'} - saved {new Date(selectedSnapshot.createdAt).toLocaleString()}</p>
                  </div>
                  <button className="btn-secondary" type="button" onClick={() => void removeSnapshot(selectedSnapshot.id)}>Delete snapshot</button>
                </div>
                <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{stringifyPayload(selectedSnapshot.payload)}</pre>
              </div>
            ) : <p className="text-sm text-slate-500">Select a snapshot to preview it.</p>}
          </div>
        </div>
      </section>

      {selectedSnapshot ? (
        <section className="print-page print-only hidden">
          <h1 className="text-2xl font-bold">{selectedSnapshot.title}</h1>
          <p className="mt-1 text-sm">Offline snapshot - may not include latest changes.</p>
          <p className="mt-1 text-sm">Hotel: {selectedSnapshot.hotelName || 'Hotel'}</p>
          <p className="mt-1 text-sm">Saved: {new Date(selectedSnapshot.createdAt).toLocaleString()}</p>
          <pre className="mt-6 whitespace-pre-wrap text-xs">{stringifyPayload(selectedSnapshot.payload)}</pre>
        </section>
      ) : null}
    </div>
  );
}

function PayloadSummary({ item }: { item: OfflineQueueItem }) {
  const payload = (item.payload || {}) as Record<string, unknown>;
  const fields = [
    payload.guest_name ? `Guest: ${String(payload.guest_name)}` : null,
    payload.reservation_id ? `Reservation: ${String(payload.reservation_id)}` : null,
    payload.check_in && payload.check_out ? `Dates: ${String(payload.check_in)} to ${String(payload.check_out)}` : null,
    payload.room_id ? `Room ID: ${String(payload.room_id)}` : null,
    payload.count_date ? `Cash count date: ${String(payload.count_date)}` : null,
    payload.description ? `Description: ${String(payload.description)}` : null
  ].filter(Boolean);

  if (!fields.length) return null;
  return <p className="mt-2 text-xs text-slate-600">{fields.join(' | ')}</p>;
}
