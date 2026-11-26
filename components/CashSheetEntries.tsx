'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fillSheetCopy,
  replaceHeldSheetEntry,
  saveSheetEntryWithQueue,
  sendHeldSheetEntry,
  sheetEntryPayload,
  sheetHeldEntry,
  sheetRetrySource,
  sheetWaitingCount,
  syncSheetQueue,
  SHEET_ENTRY_CATEGORIES,
  SHEET_ENTRY_METHODS,
  type SheetPendingEntry
} from '@/lib/cash-sheet';
import {
  LEDGER_NEEDS_ATTENTION_ERROR,
  needsAttentionLedgerEntries,
  pendingLedgerEntries,
  queuedLedgerHint,
  resetStaleSyncingLedgerEntries,
  readLedgerQueue,
  retryableLedgerEntries,
  sameLedgerRetryPayload,
  type LedgerQueueItem
} from '@/lib/ledger-entry-queue';
import { currency } from '@/lib/money';
import { startSheetAutoSend, type SheetAutoSendReason } from '@/lib/sheet-auto-send';

type Row = {
  id?: string;
  category?: string | null;
  description?: string | null;
  payment_method?: string | null;
  is_collectible?: boolean;
  amount?: number | string | null;
};

/** Translated sentences for the "earlier entry didn't save" choice. {old} and {new} are filled with amounts. */
export type CashSheetChoiceCopy = {
  question: string;
  send: string;
  replace: string;
  alreadySaved: string;
  saved: string;
};

function readSheetForm(formElement: HTMLFormElement | null, context: { hotelId: string; businessDate: string; outletId: string | null }) {
  if (!formElement) return { amount: '' } as Record<string, unknown>;
  const form = new FormData(formElement);
  return sheetEntryPayload(
    { category: form.get('category'), description: form.get('description'), amount: form.get('amount'), payment_method: form.get('payment_method') },
    context
  );
}

function findHeldEntry(formValues: Record<string, unknown>, context: { userId: string; hotelId: string; outletId: string | null; preferId?: string | null }) {
  return sheetHeldEntry({
    formValues,
    queued: retryableLedgerEntries(window.localStorage, context.userId),
    hotelId: context.hotelId,
    outletId: context.outletId,
    preferId: context.preferId
  });
}

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
  userId,
  choiceCopy
}: {
  hotelId: string;
  outletId: string | null;
  businessDate: string;
  currencyCode: string;
  rows: Row[];
  total: number;
  locked: boolean;
  userId: string;
  choiceCopy: CashSheetChoiceCopy;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // The entry that failed last. It stays in #33's device queue (hotel_ops_ledger_entry_queue:<userId>).
  // Retry reads the form as it is now; the id is kept only when nothing was edited.
  const pendingRef = useRef<SheetPendingEntry>(null);
  const [canRetry, setCanRetry] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Option (a): an earlier entry is queued and the form now says something else. Nothing is sent by itself.
  const [held, setHeld] = useState<LedgerQueueItem | null>(null);
  // A save staff started is running; auto-send waits. autoSendRef re-arms the retry timer after a failure.
  const busyRef = useRef(false);
  const autoSendRef = useRef<ReturnType<typeof startSheetAutoSend> | null>(null);
  const [formAmount, setFormAmount] = useState('');

  function readForm(formElement: HTMLFormElement | null) {
    return readSheetForm(formElement, { hotelId, businessDate, outletId });
  }

  function clearPending() {
    pendingRef.current = null;
    setCanRetry(false);
  }

  function findHeld(formValues: Record<string, unknown>) {
    return findHeldEntry(formValues, { userId, hotelId, outletId, preferId: pendingRef.current?.clientRequestId });
  }

  function money(value: unknown) {
    return currency(Number(value || 0), currencyCode);
  }

  function finishSaved(text: string) {
    setHeld(null);
    clearPending();
    formRef.current?.reset();
    setFormAmount('');
    setMessage(text);
    router.refresh();
  }

  function onFormInput() {
    const values = readForm(formRef.current);
    setFormAmount(String(values.amount ?? ''));
    if (!held) return;
    const stillHeld = findHeld(values);
    setHeld(stillHeld);
    // The form matches the queued entry again (or is empty): back to normal auto-send.
    if (!stillHeld) autoSendRef.current?.soon();
  }

  async function submit() {
    const formValues = readForm(formRef.current);
    const waiting = findHeld(formValues);
    if (waiting) {
      setHeld(waiting);
      setFormAmount(String(formValues.amount ?? ''));
      setMessage('');
      return;
    }
    const queued = retryableLedgerEntries(window.localStorage, userId);
    // The form matches an entry still queued here (for example after a reload): resend that one, same id.
    const sameAsQueued = String(formValues.amount ?? '').trim()
      ? queued.find((item) => item.hotelId === hotelId && sameLedgerRetryPayload(item.payload, formValues, { outletId, hotelId }))
      : undefined;
    const source = sheetRetrySource({
      formValues,
      pending: sameAsQueued ? { clientRequestId: sameAsQueued.clientRequestId, payload: sameAsQueued.payload } : pendingRef.current,
      queued
    });
    if (!source) return;
    busyRef.current = true;
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
      busyRef.current = false;
      setSaving(false);
      autoSendRef.current?.soon();
    }
  }

  async function chooseSend() {
    const item = held;
    if (!item) return;
    busyRef.current = true;
    setSaving(true);
    setMessage('');
    try {
      const result = await sendHeldSheetEntry(item, { userId, hotelId, outletId, storage: window.localStorage });
      if (result.ok) {
        finishSaved(fillSheetCopy(choiceCopy.saved, { amount: money(item.payload.amount) }));
        return;
      }
      if (!result.retryable && !result.needsAttention) setHeld(null);
      setMessage(queuedLedgerHint(result.error, result.retryable, Boolean(result.needsAttention)));
    } finally {
      busyRef.current = false;
      setSaving(false);
      autoSendRef.current?.soon();
    }
  }

  async function chooseReplace() {
    const item = held;
    if (!item) return;
    const formValues = readForm(formRef.current);
    busyRef.current = true;
    setSaving(true);
    setMessage('');
    try {
      const outcome = await replaceHeldSheetEntry(item, formValues, { userId, hotelId, outletId, storage: window.localStorage });
      if (outcome.kind === 'already_saved') {
        finishSaved(fillSheetCopy(choiceCopy.alreadySaved, { old: money(outcome.amount) }));
        return;
      }
      if (outcome.kind !== 'sent') {
        setMessage(outcome.error);
        return;
      }
      setHeld(null);
      const result = outcome.result;
      if (result.ok) {
        finishSaved(fillSheetCopy(choiceCopy.saved, { amount: money(formValues.amount) }));
        return;
      }
      const keep = result.retryable || Boolean(result.needsAttention);
      pendingRef.current = keep ? { clientRequestId: result.clientRequestId, payload: formValues } : null;
      setCanRetry(keep);
      setMessage(queuedLedgerHint(result.error, result.retryable, Boolean(result.needsAttention)));
    } finally {
      busyRef.current = false;
      setSaving(false);
      autoSendRef.current?.soon();
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
    async function flush(reason: SheetAutoSendReason): Promise<{ remaining: number }> {
      if (!userId) return { remaining: 0 };
      const storage = window.localStorage;
      // A save staff started is still running: leave its entry alone and look again shortly.
      if (busyRef.current) return { remaining: sheetWaitingCount(readLedgerQueue(storage, userId)) };
      if (reason === 'load') resetStaleSyncingLedgerEntries(storage, userId);
      showAttention();
      const formValues = readSheetForm(formRef.current, { hotelId, businessDate, outletId });
      const waiting = findHeldEntry(formValues, { userId, hotelId, outletId, preferId: pendingRef.current?.clientRequestId });
      if (waiting) {
        // The form differs from what is queued: ask, do not send.
        setHeld(waiting);
        setFormAmount(String(formValues.amount ?? ''));
      }
      const skipIds = waiting
        ? retryableLedgerEntries(storage, userId).filter((item) => item.hotelId === hotelId).map((item) => item.clientRequestId)
        : [];
      const toSend = pendingLedgerEntries(storage, userId).filter((item) => !skipIds.includes(item.clientRequestId));
      if (!toSend.length) return { remaining: sheetWaitingCount(readLedgerQueue(storage, userId), skipIds) };
      const formMatch = String(formValues.amount ?? '').trim()
        ? toSend.find((item) => item.hotelId === hotelId && sameLedgerRetryPayload(item.payload, formValues, { outletId, hotelId }))
        : undefined;
      busyRef.current = true;
      setSaving(true);
      try {
        const result = await syncSheetQueue({ storage, userId, skipIds, resetStale: false });
        if (cancelled) return { remaining: 0 };
        if (result.synced.length > 0) {
          clearPending();
          if (formMatch && result.synced.includes(formMatch.clientRequestId)) {
            formRef.current?.reset();
            setFormAmount('');
          }
          setMessage(result.synced.length === 1 ? 'Entry saved.' : `${result.synced.length} entries saved.`);
          router.refresh();
        }
        if (result.failed > 0 && result.lastError) {
          setCanRetry(true);
          setMessage(queuedLedgerHint(result.lastError, true));
        }
        showAttention();
      } finally {
        busyRef.current = false;
        if (!cancelled) setSaving(false);
      }
      return { remaining: sheetWaitingCount(readLedgerQueue(storage, userId), skipIds) };
    }
    const sender = startSheetAutoSend({ win: window, doc: document, run: flush, isOnline: () => navigator.onLine });
    autoSendRef.current = sender;
    return () => {
      cancelled = true;
      sender.stop();
      if (autoSendRef.current === sender) autoSendRef.current = null;
    };
  }, [router, userId, hotelId, outletId, businessDate]);

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
          <form ref={formRef} onSubmit={addEntry} onInput={onFormInput} className="space-y-3">
            {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm" role="status">{message}</p> : null}
            {held ? (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm" role="alert">
                <p className="font-semibold">{fillSheetCopy(choiceCopy.question, { old: money(held.payload.amount), new: money(formAmount) })}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-secondary" type="button" disabled={saving} onClick={() => void chooseSend()}>
                    {fillSheetCopy(choiceCopy.send, { old: money(held.payload.amount) })}
                  </button>
                  <button className="btn-primary" type="button" disabled={saving} onClick={() => void chooseReplace()}>
                    {fillSheetCopy(choiceCopy.replace, { new: money(formAmount) })}
                  </button>
                </div>
              </div>
            ) : null}
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
            <button className="btn-primary w-full" type="submit" disabled={saving || Boolean(held)}>{saving ? 'Saving…' : 'Save entry'}</button>
            {canRetry && !saving && !held ? (
              <button className="btn-secondary w-full" type="button" onClick={() => void submit()}>Retry</button>
            ) : null}
          </form>
        )}
      </div>
    </section>
  );
}
