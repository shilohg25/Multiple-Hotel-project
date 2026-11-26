'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SHEET_ENTRY_CATEGORIES, SHEET_ENTRY_METHODS } from '@/lib/cash-sheet';
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
  locked
}: {
  hotelId: string;
  outletId: string | null;
  businessDate: string;
  currencyCode: string;
  rows: Row[];
  total: number;
  locked: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const category = String(form.get('category') || 'other');
    const body: Record<string, unknown> = {
      hotel_id: hotelId,
      entry_date: businessDate,
      category,
      description: String(form.get('description') || ''),
      amount: form.get('amount'),
      payment_method: form.get('payment_method') || 'cash',
      is_collectible: category === 'collectible' ? 'true' : 'false'
    };
    if (outletId) body.outlet_id = outletId;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Could not save this entry.');
        return;
      }
      formElement.reset();
      setMessage('Entry saved.');
      router.refresh();
    } catch {
      setMessage('No internet. This entry was not saved. What you typed is still in the form. Press Save entry again when you are back online.');
    } finally {
      setSaving(false);
    }
  }

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
          <form onSubmit={addEntry} className="space-y-3">
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
          </form>
        )}
      </div>
    </section>
  );
}
