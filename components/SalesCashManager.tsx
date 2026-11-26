'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CashCount, Hotel, LedgerEntry, PaymentMethod } from '@/types/app';
import { currency } from '@/lib/money';
import { queueOfflineItem } from '@/lib/offline/db';
import {
  pendingLedgerEntries,
  queuedLedgerHint,
  saveLedgerEntryWithQueue,
  syncPendingLedgerEntries
} from '@/lib/ledger-entry-queue';

const denominations = [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25];
const paymentMethods: PaymentMethod[] = ['cash', 'gcash', 'bank_transfer', 'card', 'online_gateway', 'booking_dot_com', 'trip_dot_com', 'other'];

export function SalesCashManager({
  hotels,
  selectedHotel,
  selectedDate,
  ledgerEntries,
  cashCounts,
  breakdown,
  outletId
}: {
  hotels: Hotel[];
  selectedHotel: Hotel;
  selectedDate: string;
  ledgerEntries: LedgerEntry[];
  cashCounts: CashCount[];
  outletId?: string | null;
  breakdown?: {
    roomPayments: number;
    serviceCharges: number;
    breakfastCharges: number;
    dayTourSales: number;
    remittanceDue: number;
    remittancePaid: number;
  };
}) {
  const router = useRouter();
  const ledgerFormRef = useRef<HTMLFormElement>(null);
  const pendingLedgerIdRef = useRef<string | null>(null);
  const [message, setMessage] = useState('');
  const [offlineCashDraft, setOfflineCashDraft] = useState<Record<string, unknown> | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState('');
  const [ledgerCanRetry, setLedgerCanRetry] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);

  const cashCountMap = useMemo(() => {
    const map = new Map<number, number>();
    cashCounts.forEach((count) => map.set(Number(count.denomination), Number(count.quantity)));
    return map;
  }, [cashCounts]);

  const totals = useMemo(() => {
    const isCollectible = (entry: LedgerEntry) => entry.is_collectible || entry.category === 'collectible';
    const isExpense = (entry: LedgerEntry) => entry.category === 'expense' || entry.category === 'expenses';
    const salesTotal = ledgerEntries.filter((entry) => !isCollectible(entry) && !isExpense(entry)).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const collectibleTotal = ledgerEntries.filter((entry) => isCollectible(entry)).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const cashSales = ledgerEntries
      .filter((entry) => !isCollectible(entry) && !isExpense(entry) && entry.payment_method === 'cash')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const cashTotal = denominations.reduce((sum, denomination) => sum + denomination * Number(cashCountMap.get(denomination) || 0), 0);
    return { salesTotal, collectibleTotal, cashSales, cashTotal, variance: cashTotal - cashSales };
  }, [cashCountMap, ledgerEntries]);

  function updateFilters(hotelId: string, date: string) {
    router.push(`/sales?hotel=${hotelId}&date=${date}`);
  }

  function readLedgerForm(form: HTMLFormElement) {
    return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
  }

  function clearLedgerPending() {
    pendingLedgerIdRef.current = null;
    setLedgerError('');
    setLedgerCanRetry(false);
  }

  async function submitLedgerEntry(formValues: Record<string, unknown>, clientRequestId?: string) {
    setMessage('');
    setLedgerError('');
    setLedgerLoading(true);
    try {
      const result = await saveLedgerEntryWithQueue(formValues, {
        clientRequestId: clientRequestId || pendingLedgerIdRef.current || undefined,
        outletId,
        storage: window.localStorage
      });
      pendingLedgerIdRef.current = result.clientRequestId;
      if (result.ok) {
        clearLedgerPending();
        ledgerFormRef.current?.reset();
        setMessage(result.duplicate ? 'Ledger entry already saved.' : 'Ledger entry saved.');
        router.refresh();
        return;
      }
      setLedgerCanRetry(result.retryable);
      setLedgerError(queuedLedgerHint(result.error, result.retryable));
      if (!result.retryable) pendingLedgerIdRef.current = null;
    } catch (error) {
      setLedgerCanRetry(true);
      setLedgerError(queuedLedgerHint(error instanceof Error ? error.message : "Couldn't save this entry. Check your connection and try again.", true));
    } finally {
      setLedgerLoading(false);
    }
  }

  async function addLedgerEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitLedgerEntry(readLedgerForm(event.currentTarget));
  }

  async function retryLedgerEntry() {
    const queued = pendingLedgerEntries(window.localStorage);
    const item = queued.find((entry) => entry.clientRequestId === pendingLedgerIdRef.current) || queued[0];
    if (item) {
      await submitLedgerEntry(item.payload, item.clientRequestId);
      return;
    }
    if (ledgerFormRef.current) await submitLedgerEntry(readLedgerForm(ledgerFormRef.current));
  }

  useEffect(() => {
    let cancelled = false;

    async function flushQueuedLedgerEntries() {
      if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
      const queued = pendingLedgerEntries(window.localStorage);
      if (!queued.length) return;
      setLedgerLoading(true);
      try {
        const result = await syncPendingLedgerEntries({
          storage: window.localStorage,
          isOnline: () => navigator.onLine
        });
        if (cancelled) return;
        if (result.synced > 0) {
          clearLedgerPending();
          ledgerFormRef.current?.reset();
          setMessage(result.synced === 1 ? 'Ledger entry saved.' : `${result.synced} ledger entries saved.`);
          router.refresh();
        }
        if (result.failed > 0 && result.lastError) {
          setLedgerCanRetry(true);
          setLedgerError(queuedLedgerHint(result.lastError, true));
        }
      } catch {
        // Keep the form as-is if a queued retry cannot run yet.
      } finally {
        if (!cancelled) setLedgerLoading(false);
      }
    }

    function onOnline() {
      void flushQueuedLedgerEntries();
    }

    void flushQueuedLedgerEntries();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [router]);

  async function saveCashCount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setCashLoading(true);
    const form = new FormData(event.currentTarget);
    const counts = denominations.map((denomination) => ({
      denomination,
      quantity: Number(form.get(`denom_${denomination}`) || 0)
    }));
    const payload = { hotel_id: selectedHotel.id, count_date: selectedDate, counts };
    try {
      const response = await fetch('/api/cash-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Unable to save cash count.');
        return;
      }
      setMessage('Cash count saved.');
      router.refresh();
    } catch {
      setOfflineCashDraft(payload);
      setMessage('Network unavailable. You can save this cash count locally and sync it later.');
    } finally {
      setCashLoading(false);
    }
  }

  async function saveOfflineCashCount() {
    if (!offlineCashDraft) return;
    setCashLoading(true);
    try {
      await queueOfflineItem('cash_count_draft', offlineCashDraft);
      setOfflineCashDraft(null);
      setMessage('Saved locally. Sync when internet returns. Duplicate date/hotel cash counts may need review.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save offline cash count draft.');
    } finally {
      setCashLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label>Hotel</label>
            <select value={selectedHotel.id} onChange={(event) => updateFilters(event.target.value, selectedDate)} className="w-full">
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label>Date</label>
            <input type="date" value={selectedDate} onChange={(event) => updateFilters(selectedHotel.id, event.target.value)} className="w-full" />
          </div>
        </div>
      </section>

      {message ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Recorded sales" value={currency(totals.salesTotal, selectedHotel.default_currency)} />
        <SummaryCard label="Collectibles" value={currency(totals.collectibleTotal, selectedHotel.default_currency)} />
        <SummaryCard label="Cash sales" value={currency(totals.cashSales, selectedHotel.default_currency)} />
        <SummaryCard label="Cash variance" value={currency(totals.variance, selectedHotel.default_currency)} helper={`Counted ${currency(totals.cashTotal, selectedHotel.default_currency)}`} />
      </section>

      {breakdown ? (
        <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Confirmed room payments" value={currency(breakdown.roomPayments, selectedHotel.default_currency)} />
          <SummaryCard label="Service charges" value={currency(breakdown.serviceCharges, selectedHotel.default_currency)} />
          <SummaryCard label="Breakfast and extra beds" value={currency(breakdown.breakfastCharges, selectedHotel.default_currency)} />
          <SummaryCard label="Day tour sales" value={currency(breakdown.dayTourSales, selectedHotel.default_currency)} />
          <SummaryCard label="Remittance due" value={currency(breakdown.remittanceDue, selectedHotel.default_currency)} />
          <SummaryCard label="Remittance paid" value={currency(breakdown.remittancePaid, selectedHotel.default_currency)} />
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold">Daily ledger</h2>
            <p className="mt-1 text-sm text-slate-500">Use this for room sales, add-ons, deposits, collectibles, and other daily entries.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-5 py-3 capitalize">{entry.category.replaceAll('_', ' ')}</td>
                    <td className="px-5 py-3 text-slate-600">{entry.description || '-'}</td>
                    <td className="px-5 py-3 capitalize text-slate-600">{entry.payment_method.replaceAll('_', ' ')}</td>
                    <td className="px-5 py-3">{entry.is_collectible ? 'Collectible' : 'Sale'}</td>
                    <td className="px-5 py-3 text-right font-semibold">{currency(entry.amount, selectedHotel.default_currency)}</td>
                  </tr>
                ))}
                {!ledgerEntries.length ? <tr><td colSpan={5} className="px-5 py-6 text-slate-500">No ledger entries for this date.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-bold">Add ledger entry</h2>
          <form ref={ledgerFormRef} onSubmit={addLedgerEntry} className="mt-4 space-y-4">
            <input type="hidden" name="hotel_id" value={selectedHotel.id} />
            <input type="hidden" name="entry_date" value={selectedDate} />
            <div className="space-y-2">
              <label>Category</label>
              <select name="category" className="w-full">
                <option value="room">Room</option>
                <option value="room_payment">Room payment</option>
                <option value="add_on">Add-on</option>
                <option value="deposit">Deposit</option>
            <option value="collectible">Collectible</option>
            <option value="expense">Expense</option>
            <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <label>Description</label>
              <textarea name="description" rows={3} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label>Amount</label>
                <input name="amount" type="number" step="0.01" required className="w-full" />
              </div>
              <div className="space-y-2">
                <label>Payment method</label>
                <select name="payment_method" className="w-full">
                  {paymentMethods.map((method) => <option key={method} value={method}>{method.replaceAll('_', ' ')}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input name="is_collectible" type="checkbox" value="true" />
              Mark as collectible / unpaid
            </label>
            <button className="btn-primary w-full" disabled={ledgerLoading} type="submit">{ledgerLoading ? 'Saving...' : 'Save entry'}</button>
            {ledgerError ? (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                <p>{ledgerError}</p>
                {ledgerCanRetry ? (
                  <button className="btn-secondary mt-2" disabled={ledgerLoading} type="button" onClick={() => void retryLedgerEntry()}>
                    Retry
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>
        </section>
      </div>

      <section className="card p-5">
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold">Cash count</h2>
            <p className="mt-1 text-sm text-slate-500">Enter bill and coin quantities for the selected hotel/date.</p>
          </div>
          <p className="text-sm font-semibold">Total counted: {currency(totals.cashTotal, selectedHotel.default_currency)}</p>
        </div>
        <form onSubmit={saveCashCount} className="mt-4 grid gap-3 md:grid-cols-5">
          {denominations.map((denomination) => (
            <div key={denomination} className="space-y-2">
              <label>{currency(denomination, selectedHotel.default_currency)}</label>
              <input name={`denom_${denomination}`} type="number" min="0" step="1" defaultValue={cashCountMap.get(denomination) || 0} className="w-full" />
            </div>
          ))}
          <div className="md:col-span-5">
            <button className="btn-primary" disabled={cashLoading} type="submit">{cashLoading ? 'Saving...' : 'Save cash count'}</button>
            {offlineCashDraft ? (
              <button className="btn-secondary ml-2" disabled={cashLoading} type="button" onClick={() => void saveOfflineCashCount()}>
                Save offline cash count
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}
