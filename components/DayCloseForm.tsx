'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CASH_DENOMINATIONS, countMapForBucket, formNumberValue, hasCashBeenCounted, type CloseFigures, type SavedCountRow } from '@/lib/day-close';
import { fillSheetCopy, sheetCloseSummary, sheetReturnToFund } from '@/lib/cash-sheet';
import { currency } from '@/lib/money';
import { fetchJsonWithTimeout, RequestTimeoutError } from '@/lib/fetch-timeout';

type CountMap = Record<number, number>;

export type DayCloseFormCopy = {
  sheetSaved: string;
  sheetSavedPlain: string;
  notCountedYet: string;
  variance: string;
  short: string;
  excess: string;
  balanced: string;
};

const DEFAULT_COPY: DayCloseFormCopy = {
  sheetSaved: 'Saved. The day is {status}.',
  sheetSavedPlain: 'Saved.',
  notCountedYet: 'Not counted yet',
  variance: 'Variance',
  short: 'Short',
  excess: 'Excess',
  balanced: 'Balanced'
};

type MessageKind = 'ok' | 'error' | '';

function savedFeedbackKey(hotelId: string, businessDate: string, outletId: string | null) {
  return `cash-sheet-saved:${hotelId}:${businessDate}:${outletId || 'hotel'}`;
}

const savedFeedbackMemory = new Map<string, string>();

function rememberSavedFeedback(key: string, message: string) {
  savedFeedbackMemory.set(key, message);
  try {
    sessionStorage.setItem(key, message);
  } catch {
    // Private mode or unavailable storage should not block the save.
  }
}

function peekSavedFeedback(key: string): string {
  const memory = savedFeedbackMemory.get(key);
  if (memory) return memory;
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function clearSavedFeedback(key: string) {
  savedFeedbackMemory.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}

export function DayCloseForm({
  hotelId,
  outletId,
  businessDate,
  currencyCode,
  figures,
  profiles,
  existing,
  savedCounts,
  canLock,
  shortages,
  copy = DEFAULT_COPY
}: {
  hotelId: string;
  outletId: string | null;
  businessDate: string;
  currencyCode: string;
  figures: CloseFigures;
  profiles: { id: string; full_name: string | null; role: string }[];
  existing: { id: string; status: string; responsible_profile_id: string | null; bank_deposit: number; return_to_fund: number; variance_note: string | null; variance_status: string } | null;
  savedCounts: SavedCountRow[];
  canLock: boolean;
  shortages: { id: string; amount: number; note: string | null; staff_name: string }[];
  copy?: DayCloseFormCopy;
}) {
  const router = useRouter();
  const locked = existing?.status === 'locked';
  const [floatCounts, setFloatCounts] = useState<CountMap>(() => countMapForBucket(savedCounts, 'float'));
  const [drawerCounts, setDrawerCounts] = useState<CountMap>(() => countMapForBucket(savedCounts, 'drawer'));
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<MessageKind>('');
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [bankDeposit, setBankDeposit] = useState(Number(existing?.bank_deposit || 0));
  // null = staff have not touched Return to fund. Then it follows the current default (saved close
  // value, or the expenses from the ledger), so an expense typed above updates it after the refresh.
  // Counts and the bank deposit are only ever typed by staff, so keeping them across a refresh is right.
  const [returnToFundEdit, setReturnToFundEdit] = useState<number | null>(null);
  const returnToFund = sheetReturnToFund(existing, figures, returnToFundEdit);
  const [saving, setSaving] = useState(false);
  // Same helpers and order as POST /api/day-closes, so the preview equals what gets stored.
  const preview = useMemo(
    () => sheetCloseSummary(figures, { floatCounts, drawerCounts, bankDeposit, returnToFund }),
    [figures, floatCounts, drawerCounts, bankDeposit, returnToFund]
  );
  const floatCounted = preview.floatCounted;
  const drawerCounted = preview.drawerCounted;
  const counted = hasCashBeenCounted(floatCounts, drawerCounts, bankDeposit);
  const feedbackKey = savedFeedbackKey(hotelId, businessDate, outletId);

  useEffect(() => {
    const stored = peekSavedFeedback(feedbackKey);
    if (stored) {
      setMessage(stored);
      setMessageKind('ok');
    }
    const timer = window.setTimeout(() => clearSavedFeedback(feedbackKey), 800);
    return () => window.clearTimeout(timer);
  }, [feedbackKey]);

  useEffect(() => {
    if (!message || !statusRef.current) return;
    statusRef.current.focus({ preventScroll: true });
    statusRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [message, messageKind]);

  function statusLabel(status?: string) {
    if (status === 'short') return copy.short;
    if (status === 'excess') return copy.excess;
    if (status === 'balanced') return copy.balanced;
    return '';
  }

  function savedMessage(status?: string) {
    const label = statusLabel(status);
    return label ? fillSheetCopy(copy.sheetSaved, { status: label }) : copy.sheetSavedPlain;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage('');
    setMessageKind('');
    try {
      const { response, json: raw } = await fetchJsonWithTimeout('/api/day-closes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotel_id: hotelId,
          outlet_id: outletId,
          business_date: businessDate,
          responsible_profile_id: form.get('responsible_profile_id'),
          bank_deposit: bankDeposit,
          return_to_fund: returnToFund,
          variance_note: form.get('variance_note'),
          float_counts: CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: floatCounts[denomination] || 0 })),
          drawer_counts: CASH_DENOMINATIONS.map((denomination) => ({ denomination, quantity: drawerCounts[denomination] || 0 }))
        })
      });
      const json = (raw || {}) as { error?: string; summary?: { status?: string } };
      if (response.ok) {
        const text = savedMessage(json.summary?.status);
        rememberSavedFeedback(feedbackKey, text);
        setMessage(text);
        setMessageKind('ok');
        router.refresh();
      } else {
        setMessage(json.error || 'Could not save.');
        setMessageKind('error');
      }
    } catch (error) {
      if (error instanceof RequestTimeoutError) {
        setMessage('No answer from the server. The cash sheet may not be saved. Your count is still on the screen. Press Save cash sheet again.');
        setMessageKind('error');
        return;
      }
      setMessage('No internet. The cash sheet was not saved. Your count is still on the screen. Press Save again when you are back online.');
      setMessageKind('error');
    } finally {
      setSaving(false);
    }
  }

  async function lockOrUnlock(action: 'lock' | 'unlock') {
    if (!existing) return;
    const response = await fetch(`/api/day-closes/${existing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason: unlockReason })
    });
    const json = await response.json().catch(() => ({}));
    if (response.ok) {
      const text = action === 'lock' ? 'Day locked.' : 'Day unlocked.';
      rememberSavedFeedback(feedbackKey, text);
      setMessage(text);
      setMessageKind('ok');
      router.refresh();
    } else {
      setMessage(json.error || 'Could not update the lock.');
      setMessageKind('error');
    }
  }

  const messageClass = messageKind === 'ok'
    ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900'
    : messageKind === 'error'
      ? 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800'
      : 'rounded-lg bg-slate-100 px-3 py-2 text-sm';

  return (
    <form className="space-y-6" onSubmit={save}>
      <h2 className="text-xl font-bold">3. Close figures</h2>
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
        <VarianceStat counted={counted} status={preview.status} value={currency(preview.variance, currencyCode)} copy={copy} />
      </section>

      <div>
        <h2 className="text-xl font-bold">4. Count the cash once</h2>
        <p className="mt-1 text-sm text-slate-600">This is the only cash count for the day. Count the float, then the cash still in the drawer.</p>
      </div>
      <label className="block max-w-md space-y-1">Staff responsible for this shift
        <select name="responsible_profile_id" className="w-full" defaultValue={existing?.responsible_profile_id || ''} required disabled={locked}>
          <option value="">Choose a person</option>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.role} · {profile.role.replaceAll('_', ' ')}</option>)}
        </select>
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <CountBox title="RVF float count" counts={floatCounts} onChange={setFloatCounts} disabled={locked} />
        <CountBox title="Cash still in the drawer" counts={drawerCounts} onChange={setDrawerCounts} disabled={locked} />
      </div>
      <p className="text-sm text-slate-600">Float counted {currency(floatCounted, currencyCode)}. Cash still in the drawer {currency(drawerCounted, currencyCode)}. Already deposited {currency(bankDeposit, currencyCode)}. Count only bills that are still in the drawer. Type only money already taken to the bank. Do not enter the same bills in both places. The close adds them.</p>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">Return to fund
          <input name="return_to_fund" type="number" min="0" step="0.01" value={formNumberValue(returnToFund)} onChange={(event) => setReturnToFundEdit(Number(event.target.value || 0))} className="w-full" disabled={locked} />
        </label>
        <label className="space-y-1">Already deposited to the bank
          <input name="bank_deposit" type="number" min="0" step="0.01" value={bankDeposit || ''} onChange={(event) => setBankDeposit(Number(event.target.value || 0))} className="w-full" disabled={locked} />
        </label>
        <label className="space-y-1 md:col-span-2">Note if short or over
          <textarea name="variance_note" rows={3} defaultValue={existing?.variance_note || ''} className="w-full" disabled={locked} placeholder="Required when the count is not balanced." />
        </label>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {!locked ? <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save cash sheet'}</button> : <p className="font-semibold">This day is locked. Entries are read-only.</p>}
          {canLock && existing && !locked ? <button className="btn-primary" type="button" onClick={() => lockOrUnlock('lock')}>Lock the day</button> : null}
        </div>
        {message ? (
          <p
            ref={statusRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            className={`${messageClass} max-w-xl outline-none`}
          >
            {message}
          </p>
        ) : null}
      </div>

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

function VarianceStat({
  counted,
  status,
  value,
  copy
}: {
  counted: boolean;
  status: 'balanced' | 'short' | 'excess';
  value: string;
  copy: DayCloseFormCopy;
}) {
  if (!counted) {
    return (
      <div className="card p-3">
        <p className="text-xs uppercase text-slate-500">{copy.variance}</p>
        <p className="text-xl font-black text-slate-500">{copy.notCountedYet}</p>
      </div>
    );
  }
  const label = status === 'short' ? copy.short : status === 'excess' ? copy.excess : copy.balanced;
  const valueClass = status === 'short'
    ? 'text-xl font-black text-rose-700'
    : status === 'excess'
      ? 'text-xl font-black text-amber-800'
      : 'text-xl font-black text-emerald-800';
  return (
    <div className="card p-3">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className={valueClass}>{value}</p>
    </div>
  );
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
