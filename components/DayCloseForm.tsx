'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CASH_DENOMINATIONS, countTotal, summarizeClose, type CloseFigures } from '@/lib/day-close';
import { currency } from '@/lib/money';

type CountMap = Record<number, number>;

export function DayCloseForm({
  hotelId,
  outletId,
  businessDate,
  currencyCode,
  figures,
  profiles,
  existing,
  canLock,
  shortages
}: {
  hotelId: string;
  outletId: string | null;
  businessDate: string;
  currencyCode: string;
  figures: CloseFigures;
  profiles: { id: string; full_name: string | null; role: string }[];
  existing: { id: string; status: string; responsible_profile_id: string | null; bank_deposit: number; return_to_fund: number; variance_note: string | null; variance_status: string } | null;
  canLock: boolean;
  shortages: { id: string; amount: number; note: string | null; staff_name: string }[];
}) {
  const router = useRouter();
  const locked = existing?.status === 'locked';
  const [floatCounts, setFloatCounts] = useState<CountMap>({});
  const [drawerCounts, setDrawerCounts] = useState<CountMap>({});
  const [message, setMessage] = useState('');
  const [unlockReason, setUnlockReason] = useState('');
  const [bankDeposit, setBankDeposit] = useState(Number(existing?.bank_deposit || 0));
  const floatCounted = countTotal(CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: floatCounts[denomination] || 0 })));
  const drawerCounted = countTotal(CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: drawerCounts[denomination] || 0 })));
  const preview = useMemo(
    () => summarizeClose({ ...figures, floatCounted, drawerCounted, bankDeposit }),
    [figures, floatCounted, drawerCounted, bankDeposit]
  );

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/day-closes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotel_id: hotelId,
        outlet_id: outletId,
        business_date: businessDate,
        responsible_profile_id: form.get('responsible_profile_id'),
        bank_deposit: bankDeposit,
        return_to_fund: Number(form.get('return_to_fund') || 0),
        variance_note: form.get('variance_note'),
        float_counts: CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: floatCounts[denomination] || 0 })),
        drawer_counts: CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: drawerCounts[denomination] || 0 }))
      })
    });
    const json = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Saved. The day is ${json.summary?.status || 'saved'}.` : json.error || 'Could not save.');
    if (response.ok) router.refresh();
  }

  async function lockOrUnlock(action: 'lock' | 'unlock') {
    if (!existing) return;
    const response = await fetch(`/api/day-closes/${existing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason: unlockReason })
    });
    const json = await response.json().catch(() => ({}));
    setMessage(response.ok ? (action === 'lock' ? 'Day locked.' : 'Day unlocked.') : json.error || 'Could not update the lock.');
    if (response.ok) router.refresh();
  }

  return (
    <form className="space-y-6" onSubmit={save}>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</p> : null}
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Room sales" value={currency(preview.roomSales, currencyCode)} />
        <Stat label="Add-ons" value={currency(preview.addonSales, currencyCode)} />
        <Stat label="Other sales" value={currency(preview.miscSales, currencyCode)} />
        <Stat label="Expenses" value={currency(preview.expenses, currencyCode)} />
        <Stat label="Collectibles" value={currency(preview.collectibles, currencyCode)} />
        <Stat label="GCash / Maya" value={currency(preview.gcash + preview.maya, currencyCode)} />
        <Stat label="Bank / card / cheque" value={currency(preview.bank + preview.card + preview.cheque, currencyCode)} />
        <Stat label="Cash on hand" value={currency(preview.cashOnHand, currencyCode)} />
        <Stat label="Expected cash" value={currency(preview.expectedCash, currencyCode)} />
        <Stat label="RVF float" value={currency(preview.rvfFloat, currencyCode)} />
        <Stat label="Expected drawer" value={currency(preview.expectedDrawer, currencyCode)} />
        <Stat label={preview.status} value={currency(preview.variance, currencyCode)} />
      </section>

      <label className="block max-w-md space-y-1">Staff responsible for this shift
        <select name="responsible_profile_id" className="w-full" defaultValue={existing?.responsible_profile_id || ''} required disabled={locked}>
          <option value="">Choose a person</option>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.role} · {profile.role.replaceAll('_', ' ')}</option>)}
        </select>
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <CountBox title="RVF float count" counts={floatCounts} onChange={setFloatCounts} disabled={locked} />
        <CountBox title="Cash to deposit" counts={drawerCounts} onChange={setDrawerCounts} disabled={locked} />
      </div>
      <p className="text-sm text-slate-600">Float counted {currency(floatCounted, currencyCode)}. Deposit counted {currency(drawerCounted, currencyCode)}. The bill count and the bank deposit are the same deposit, so the close counts that money once.</p>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">Return to fund
          <input name="return_to_fund" type="number" min="0" step="0.01" defaultValue={existing?.return_to_fund ?? figures.returnToFund} className="w-full" disabled={locked} />
        </label>
        <label className="space-y-1">Bank deposit already made
          <input name="bank_deposit" type="number" min="0" step="0.01" value={bankDeposit || ''} onChange={(event) => setBankDeposit(Number(event.target.value || 0))} className="w-full" disabled={locked} />
        </label>
        <label className="space-y-1 md:col-span-2">Note if short or over
          <textarea name="variance_note" rows={3} defaultValue={existing?.variance_note || ''} className="w-full" disabled={locked} placeholder="Required when the count is not balanced." />
        </label>
      </div>
      {!locked ? <button className="btn-primary" type="submit">Save draft</button> : <p className="font-semibold">This day is locked. Entries are read-only.</p>}

      {canLock && existing && !locked ? <button className="btn-primary ml-2" type="button" onClick={() => lockOrUnlock('lock')}>Lock the day</button> : null}
      {canLock && locked ? (
        <div className="flex flex-wrap gap-2">
          <input value={unlockReason} onChange={(event) => setUnlockReason(event.target.value)} className="min-w-64" placeholder="Why are you unlocking this day?" />
          <button className="btn-secondary" type="button" onClick={() => lockOrUnlock('unlock')}>Unlock</button>
        </div>
      ) : null}

      {canLock ? (
        <section className="card p-4">
          <h2 className="font-bold">Shortage charges</h2>
          <p className="mt-1 text-sm text-slate-500">Only managers and owners see this. A short lock charges the responsible staff member.</p>
          {shortages.map((item) => <p key={item.id} className="mt-2 text-sm">{item.staff_name}: {currency(item.amount, currencyCode)} {item.note ? `· ${item.note}` : ''}</p>)}
          {!shortages.length ? <p className="mt-2 text-sm text-slate-500">No shortage charges for this day.</p> : null}
        </section>
      ) : null}
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="card p-3"><p className="text-xs uppercase text-slate-500">{label}</p><p className="text-xl font-black">{value}</p></div>;
}

function CountBox({ title, counts, onChange, disabled }: { title: string; counts: CountMap; onChange: (next: CountMap) => void; disabled: boolean }) {
  return (
    <section className="card p-4">
      <h2 className="font-bold">{title}</h2>
      <div className="mt-3 space-y-2">
        {CASH_DENOMINATIONS.map((denomination) => (
          <label key={denomination} className="flex items-center justify-between gap-3 text-sm">
            <span>₱{denomination}</span>
            <input
              type="number"
              min="0"
              className="w-24"
              disabled={disabled}
              value={counts[denomination] || ''}
              onChange={(event) => onChange({ ...counts, [denomination]: Number(event.target.value || 0) })}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
