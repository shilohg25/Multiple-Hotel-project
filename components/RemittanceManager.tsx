'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hotel, Outlet, Remittance, ReservationCharge } from '@/types/app';
import { currency } from '@/lib/money';

const statuses = ['pending', 'partial', 'remitted', 'cancelled'];

type RemittanceDraft = {
  amount_paid: string;
  status: string;
  notes: string;
};

export function RemittanceManager({
  hotels,
  selectedHotel,
  outlets,
  remittances,
  dueItems,
  periodStart,
  periodEnd,
  selectedOutletId,
  canManage
}: {
  hotels: Hotel[];
  selectedHotel: Hotel;
  outlets: Outlet[];
  remittances: Remittance[];
  dueItems: ReservationCharge[];
  periodStart: string;
  periodEnd: string;
  selectedOutletId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RemittanceDraft>>(() =>
    Object.fromEntries(remittances.map((item) => [item.id, {
      amount_paid: String(Number(item.amount_paid || 0)),
      status: item.status,
      notes: item.notes || ''
    }]))
  );
  const dueTotal = useMemo(() => dueItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0), [dueItems]);

  function updateFilters(next: Partial<{ hotel: string; outlet: string; from: string; to: string }>) {
    const params = new URLSearchParams({
      hotel: next.hotel ?? selectedHotel.id,
      outlet: next.outlet ?? selectedOutletId,
      from: next.from ?? periodStart,
      to: next.to ?? periodEnd
    });
    router.push(`/remittances?${params.toString()}`);
  }

  async function createRemittance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setCreating(true);
    try {
      const response = await fetch('/api/remittances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_hotel_id: selectedHotel.id,
          to_outlet_id: selectedOutletId || null,
          period_start: periodStart,
          period_end: periodEnd,
          reservation_charge_ids: dueItems.map((item) => item.id),
          status: 'pending'
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to create remittance.');
        return;
      }
      setMessage('Remittance record created.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create remittance.');
    } finally {
      setCreating(false);
    }
  }

  function updateDraft(remittance: Remittance, key: keyof RemittanceDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [remittance.id]: {
        ...(current[remittance.id] || {
          amount_paid: String(Number(remittance.amount_paid || 0)),
          status: remittance.status,
          notes: remittance.notes || ''
        }),
        [key]: value
      }
    }));
  }

  async function saveRemittance(remittance: Remittance) {
    const draft = drafts[remittance.id] || {
      amount_paid: String(Number(remittance.amount_paid || 0)),
      status: remittance.status,
      notes: remittance.notes || ''
    };
    setMessage('');
    setSavingId(remittance.id);
    try {
      const response = await fetch(`/api/remittances/${remittance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to update remittance.');
        return;
      }
      setMessage('Remittance updated.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update remittance.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="grid gap-4 md:grid-cols-5">
          <div className="space-y-2">
            <label>Hotel</label>
            <select value={selectedHotel.id} onChange={(event) => updateFilters({ hotel: event.target.value })} className="w-full">
              {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label>Outlet</label>
            <select value={selectedOutletId} onChange={(event) => updateFilters({ outlet: event.target.value })} className="w-full">
              <option value="">All outlets</option>
              {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label>From</label>
            <input type="date" value={periodStart} onChange={(event) => updateFilters({ from: event.target.value })} className="w-full" />
          </div>
          <div className="space-y-2">
            <label>To</label>
            <input type="date" value={periodEnd} onChange={(event) => updateFilters({ to: event.target.value })} className="w-full" />
          </div>
          <form onSubmit={createRemittance} className="flex items-end">
            <button className="btn-primary w-full" type="submit" disabled={!canManage || creating || !dueItems.length}>
              {creating ? 'Creating...' : 'Create batch'}
            </button>
          </form>
        </div>
      </section>

      {message ? <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Due items" value={dueItems.length} />
        <SummaryCard label="Amount due" value={currency(dueTotal, selectedHotel.default_currency)} />
        <SummaryCard label="Open remittances" value={remittances.filter((item) => item.status !== 'remitted' && item.status !== 'cancelled').length} />
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold">Remittance due items</h2>
          <p className="mt-1 text-sm text-slate-500">Reservation charges marked remittance_required appear here.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Note</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dueItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3">{new Date(item.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 font-semibold">{item.description}</td>
                  <td className="px-5 py-3 capitalize text-slate-600">{item.category.replaceAll('_', ' ')}</td>
                  <td className="px-5 py-3 text-slate-600">{item.remittance_note || '-'}</td>
                  <td className="px-5 py-3 text-right font-semibold">{currency(item.total_amount, selectedHotel.default_currency)}</td>
                </tr>
              ))}
              {!dueItems.length ? <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No remittance-required charges for this filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold">Remittance records</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {remittances.map((item) => {
            const draft = drafts[item.id] || {
              amount_paid: String(Number(item.amount_paid || 0)),
              status: item.status,
              notes: item.notes || ''
            };
            const balance = Number(item.amount_due || 0) - Number(draft.amount_paid || 0);
            return (
              <div key={item.id} className="grid gap-3 px-5 py-4 lg:grid-cols-6 lg:items-end">
                <div className="lg:col-span-2">
                  <p className="font-semibold">{item.period_start} to {item.period_end}</p>
                  <p className="text-sm text-slate-500">{item.outlets?.name || 'No outlet'} - due {currency(item.amount_due, selectedHotel.default_currency)} - balance {currency(balance, selectedHotel.default_currency)}</p>
                </div>
                <div className="space-y-2">
                  <label>Paid</label>
                  <input value={draft.amount_paid} onChange={(event) => updateDraft(item, 'amount_paid', event.target.value)} type="number" min="0" step="0.01" className="w-full" />
                </div>
                <div className="space-y-2">
                  <label>Status</label>
                  <select value={draft.status} onChange={(event) => updateDraft(item, 'status', event.target.value)} className="w-full">
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label>Notes</label>
                  <input value={draft.notes} onChange={(event) => updateDraft(item, 'notes', event.target.value)} className="w-full" />
                </div>
                <button className="btn-primary" type="button" disabled={!canManage || savingId === item.id} onClick={() => void saveRemittance(item)}>
                  {savingId === item.id ? 'Saving...' : 'Save'}
                </button>
              </div>
            );
          })}
          {!remittances.length ? <p className="px-5 py-6 text-sm text-slate-500">No remittance records yet.</p> : null}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}
