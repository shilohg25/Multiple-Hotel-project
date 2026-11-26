'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSheetEntryWithQueue, sheetEntryPayload, sheetRetrySource, SHEET_ENTRY_CATEGORIES, SHEET_ENTRY_METHODS, type SheetPendingEntry } from '@/lib/cash-sheet';
import {
  LEDGER_NEEDS_ATTENTION_ERROR,
  needsAttentionLedgerEntries,
  pendingLedgerEntries,
  queuedLedgerHint,
  resetStaleSyncingLedgerEntries,
  retryableLedgerEntries,
  syncPendingLedgerEntries
} from '@/lib/ledger-entry-queue';
import { currency } from '@/lib/money';

type Row = {
  id?: string;
  category?: string | null;
  description?: string | null;
  payment_method?: string | null;
  is_collectible?: boolean;
  amount?: number | string | null;
};

function plain(value: string | null | undefined) {
  return String(value || '').replaceAll('_', ' ');
}

/** Section 2 of the daily cash sheet: what staff type, once. Room payments are never typed here. */
export function CashSheetEntries({
  hotelId,
  outletId,
  businessDate,
  currencyCode,
  rows,
  total,
  locked,
  userId
}: {
  hotelId: string;
  outletId: string | null;
  businessDate: string;
  currencyCode: string;
  rows: Row[];
  total: number;
  locked: boolean;
  userId: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // The entry that failed last. It stays in #33's device queue (hotel_ops_ledger_entry_queue:<userId>).
  // Retry reads the form as it is now; the id is kept only when nothing was edited.
  const pendingRef = useRef<SheetPendingEntry>(null);
  const [canRetry, setCanRetry] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function readForm(formElement: HTMLFormElement | null) {
    if (!formElement) return { amount: '' } as Record<string, unknown>;
    const form = new FormData(formElement);
    return sheetEntryPayload(
      { category: form.get('category'), description: form.get('description'), amount: form.get('amount'), payment_method: form.get('payment_method') },
      { hotelId, businessDate, outletId }
    );
  }

  function clearPending() {
    pendingRef.current = null;
    setCanRetry(false);
  }

  async function submit() {
    const source = sheetRetrySource({
      formValues: readForm(formRef.current),
      pending: pendingRef.current,
      queued: retryableLedgerEntries(window.localStorage, userId)
    });
    if (!source) return;
    setSaving(true);
    setMessage('');
    try {
      const result = await saveSheetEntryWithQueue(source, { userId, hotelId, outletId, storage: window.localStorage });
      if (result.ok) {
        clearPending();
        formRef.current?.reset();
        setMessage(result.duplicate ? 'Entry already saved.' : 'Entry saved.');
        router.refresh();
        return;
      }
      const keep = result.retryable || Boolean(result.needsAttention);
      pendingRef.current = keep ? { clientRequestId: result.clientRequestId, payload: source.values } : null;
      setCanRetry(keep);
      setMessage(queuedLedgerHint(result.error, result.retryable, Boolean(result.needsAttention)));
    } catch (error) {
      setCanRetry(true);
      setMessage(queuedLedgerHint(error instanceof Error ? error.message : "Couldn't save this entry. Check your connection and try again.", true));
    } finally {
      setSaving(false);
    }
  }

  async function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit();
  }

  // Same auto-send as #33: on load and when the device comes back online, send queued entries.
  useEffect(() => {
    let cancelled = false;
    function showAttention() {
      const attention = needsAttentionLedgerEntries(window.localStorage, userId);
      if (!attention.length) return;
      pendingRef.current = { clientRequestId: attention[0].clientRequestId, payload: attention[0].payload };
      setCanRetry(true);
      setMessage(queuedLedgerHint(attention[0].error || LEDGER_NEEDS_ATTENTION_ERROR, false, true));
    }
    async function flush() {
      if (!userId) return;
      resetStaleSyncingLedgerEntries(window.localStorage, userId);
      showAttention();
      if (!navigator.onLine || !pendingLedgerEntries(window.localStorage, userId).length) return;
      setSaving(true);
      try {
        const result = await syncPendingLedgerEntries({ storage: window.localStorage, userId, isOnline: () => navigator.onLine });
        if (cancelled) return;
        if (result.synced > 0) {
          clearPending();
          setMessage(result.synced === 1 ? 'Entry saved.' : `${result.synced} entries saved.`);
          router.refresh();
        }
        if (result.failed > 0 && result.lastError) {
          setCanRetry(true);
          setMessage(queuedLedgerHint(result.lastError, true));
        }
        showAttention();
      } catch {
        // Keep the form as it is if a queued entry cannot be sent yet.
      } finally {
        if (!cancelled) setSaving(false);
      }
    }
    const onOnline = () => { void flush(); };
    void flush();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [router, userId, hotelId]);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">2. Typed today</h2>
          <p className="mt-1 text-sm text-slate-600">Only money the app does not already know: walk-in or restaurant sales, add-ons sold at the desk, expenses, and unpaid amounts. Room payments come in by themselves. Do not type them.</p>
        </div>
        <p className="text-sm font-semibold">Total typed: {currency(total, currencyCode)}</p>
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">What</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2">Paid by</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={row.id || index}>
                  <td className="px-3 py-2 capitalize">{plain(row.category)}{row.is_collectible ? ' (not paid yet)' : ''}</td>
                  <td className="px-3 py-2 text-slate-600">{row.description || '-'}</td>
                  <td className="px-3 py-2 capitalize text-slate-600">{plain(row.payment_method)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{currency(Number(row.amount || 0), currencyCode)}</td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={4} className="px-3 py-4 text-slate-500">Nothing typed yet today.</td></tr> : null}
            </tbody>
          </table>
        </div>
        {locked ? (
          <p className="text-sm font-semibold">This day is locked. A manager has to unlock it before anything new is added.</p>
        ) : (
          <form ref={formRef} onSubmit={addEntry} className="space-y-3">
            {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm" role="status">{message}</p> : null}
            <label className="block space-y-1">What is it?
              <select name="category" className="w-full" defaultValue="other">
                {SHEET_ENTRY_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">Amount
                <input name="amount" type="number" step="0.01" required className="w-full" />
              </label>
              <label className="block space-y-1">Paid by
                <select name="payment_method" className="w-full" defaultValue="cash">
                  {SHEET_ENTRY_METHODS.map((method) => <option key={method} value={method}>{plain(method)}</option>)}
                </select>
              </label>
            </div>
            <label className="block space-y-1">Note (optional)
              <input name="description" className="w-full" />
            </label>
            <button className="btn-primary w-full" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save entry'}</button>
            {canRetry && !saving ? (
              <button className="btn-secondary w-full" type="button" onClick={() => void submit()}>Retry</button>
            ) : null}
          </form>
        )}
      </div>
    </section>
  );
}
