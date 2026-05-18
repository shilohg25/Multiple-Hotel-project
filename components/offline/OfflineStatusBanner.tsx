'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPendingSyncCount } from '@/lib/offline/db';
import { syncOfflineQueue } from '@/lib/offline/sync';

export function OfflineStatusBanner() {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState(false);

  async function refreshCount() {
    try {
      setPendingCount(await getPendingSyncCount());
    } catch {
      setPendingCount(0);
    }
  }

  useEffect(() => {
    const refreshOnline = () => setOnline(navigator.onLine);
    refreshOnline();
    void refreshCount();

    window.addEventListener('online', refreshOnline);
    window.addEventListener('offline', refreshOnline);
    window.addEventListener('offline-store-changed', refreshCount);

    return () => {
      window.removeEventListener('online', refreshOnline);
      window.removeEventListener('offline', refreshOnline);
      window.removeEventListener('offline-store-changed', refreshCount);
    };
  }, []);

  async function syncNow() {
    setMessage('');
    setSyncing(true);
    try {
      const result = await syncOfflineQueue();
      setMessage(`Sync complete: ${result.synced} synced, ${result.failed} failed, ${result.needsReview} need review.`);
      await refreshCount();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  if (online && pendingCount === 0 && !message) return null;

  return (
    <div className={`print-hidden border-b px-4 py-2 text-sm ${online ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="font-semibold">{online ? 'Online' : 'Offline mode'}:</span>{' '}
          {online
            ? `${pendingCount} item${pendingCount === 1 ? '' : 's'} pending sync.`
            : 'drafts can be saved locally. Confirmed bookings and payments require sync.'}
          {message ? <span className="ml-2">{message}</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/offline" className="font-semibold underline">Offline Queue</Link>
          {online && pendingCount > 0 ? (
            <button className="font-semibold underline" type="button" disabled={syncing} onClick={() => void syncNow()}>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
