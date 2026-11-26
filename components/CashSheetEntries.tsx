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
  readSheetSentElsewhere,
  clearSheetHeldMarks,
  markSentByThisTab,
  sheetAutoSendSkips,
  watchSheetHeldMarks,
  wasSentByThisTab,
  withSheetSaving,
  writeSheetHeldMark,
  restoreSheetLinkState,
  sheetInFlightOutcome,
  sheetRetryAvailable,
  sheetSaveBlocked,
  writeSheetSentElsewhere,
  type SheetSentElsewhere,
  type SheetSourceGone,
  sheetLinkKey,
  sheetSourceGone,
  sheetQueueState,
  writeSheetLink,
  type SheetFormLink,
  sheetFormStillSent,
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
  ledgerQueueStorageKey,
  readLedgerQueue,
  retryableLedgerEntries,
  sameLedgerRetryPayload,
  type LedgerQueueItem
} from '@/lib/ledger-entry-queue';
import { currency } from '@/lib/money';
import { sheetTabIdentity } from '@/lib/sheet-tab-id';
import { createSheetBusyGate, startSheetAutoSend, watchSheetSource, type SheetAutoSendReason } from '@/lib/sheet-auto-send';

type Row = {
  id?: string;
  category?: string | null;
  description?: string | null;
  payment_method?: string | null;
  is_collectible?: boolean;
  amount?: number | string | null;
};

/** Translated sentences for the "earlier entry didn't save" choice. {old} and {new} are filled with amounts. */
/** Held-mark stamps written by this page load, so cleanup never clears another tab's. */
const heldMarksThisLoad = new Set<string>();

export type CashSheetChoiceCopy = {
  question: string;
  send: string;
  replace: string;
  alreadySaved: string;
  replacementExists: string;
  gone: string;
  inFlight: string;
  inFlightStuck: string;
  sentElsewhere: string;
  sentElsewhereEdited: string;
  sentHere: string;
  sentHereEdited: string;
  saveAsNew: string;
  clearForm: string;
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

function findHeldEntry(formValues: Record<string, unknown>, context: { userId: string; hotelId: string; outletId: string | null; sourceId?: string | null }) {
  return sheetHeldEntry({
    formValues,
    queued: retryableLedgerEntries(window.localStorage, context.userId),
    hotelId: context.hotelId,
    outletId: context.outletId,
    sourceId: context.sourceId
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
  const [busy] = useState(() => createSheetBusyGate());
  const autoSendRef = useRef<ReturnType<typeof startSheetAutoSend> | null>(null);
  const [formAmount, setFormAmount] = useState('');
  // The one entry the form came from: the last save from this form that failed and is still queued.
  // Only it can be held. Emptying the amount, a save, Send or Replace ends the link.
  const sourceRef = useRef<string | null>(null);
  const linkRef = useRef<SheetFormLink | null>(null);
  const watchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Another tab sent the entry this form came from, and staff had edited it: the edit was not saved.
  // Save is blocked until they confirm "Save as a new entry" or clear the form.
  const [sentElsewhere, setSentElsewhere] = useState<{ oldAmount: number; byThisTab: boolean } | null>(null);
  const actionsRef = useRef<{ checkSource: () => void; restoreOnLoad: () => void; persistDraft: (values: Record<string, unknown> | null) => void } | null>(null);

  /** Set or clear the link; it is also kept in sessionStorage so a reload or back/forward keeps it. */
  function setSource(link: SheetFormLink | null) {
    sourceRef.current = link?.clientRequestId ?? null;
    linkRef.current = link;
    writeSheetLink(window.sessionStorage, userId, hotelId, link);
  }

  /** Keep (or drop) the edit typed while the choice is pending, so a reload or back/forward restores it. */
  function persistDraft(values: Record<string, unknown> | null) {
    const link = linkRef.current;
    if (!link) return;
    setSource({ ...link, draft: values && String(values.amount ?? '').trim() ? values : null });
  }

  /** Put values back into the (uncontrolled) form fields, e.g. a kept draft after navigation. */
  function fillForm(values: Record<string, unknown>) {
    const form = formRef.current;
    if (!form) return;
    for (const name of ['category', 'amount', 'payment_method', 'description']) {
      const field = form.elements.namedItem(name);
      const value = values[name];
      if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement) && value !== undefined && value !== null) field.value = String(value);
    }
    setFormAmount(String(values.amount ?? ''));
  }

  function writeNote(note: SheetSentElsewhere | null) {
    writeSheetSentElsewhere(window.sessionStorage, userId, hotelId, note);
  }

  /** Recompute whether Retry has something to send: its entry still queued, no gate, no choice. */
  function retryAvailable() {
    return sheetRetryAvailable({ storage: window.localStorage, userId, pendingId: pendingRef.current?.clientRequestId, held: false, gate: false });
  }

  /**
   * The entry this form came from left the queue without this tab (another tab sent it).
   * Unchanged or empty form: clear it and say so. Edited form: keep the edit, say it was NOT saved,
   * and block Save until "Save as a new entry" or "Clear form". Kept in sessionStorage across reloads.
   */
  function applyGone(gone: SheetSourceGone, values: Record<string, unknown>, draft?: Record<string, unknown> | null) {
    stopWatching();
    setSource(null);
    clearPending();
    setHeld(null);
    const byThisTab = Boolean(gone.byThisTab);
    if (gone.kind === 'unchanged') {
      formRef.current?.reset();
      setFormAmount('');
      setSentElsewhere(null);
      writeNote({ mode: 'armed', oldAmount: gone.oldAmount, values, byThisTab });
      setMessage(fillSheetCopy(byThisTab ? choiceCopy.sentHere : choiceCopy.sentElsewhere, { old: money(gone.oldAmount) }));
    } else {
      // Keep the edit on screen (restore the kept draft if navigation emptied the form).
      if (!String(readForm(formRef.current).amount ?? '').trim() && draft) fillForm(draft);
      setFormAmount(gone.newAmount);
      setSentElsewhere({ oldAmount: gone.oldAmount, byThisTab });
      writeNote({ mode: 'gate', oldAmount: gone.oldAmount, values, byThisTab });
      setMessage('');
    }
    router.refresh();
  }

  const recheckWhenIdle = () => actionsRef.current?.checkSource();

  /**
   * Did another tab send the entry this form came from? Runs on 'storage' (queue or link changed in
   * another tab), 'online', 'focus' and visibilitychange, before each auto-send pass, and once more
   * when this tab's own send ends (a storage event during it is not lost).
   */
  function checkSource() {
    if (busy.busy) {
      busy.whenIdle(recheckWhenIdle);
      return;
    }
    const link = linkRef.current;
    const gone = sheetSourceGone({ storage: window.localStorage, session: window.sessionStorage, tabId: sheetTabIdentity().id, userId, hotelId, outletId, link, formValues: readForm(formRef.current) });
    if (gone && link) applyGone(gone, link.values, link.draft);
  }

  /** On load (reload, back/forward, remount): a link whose entry left the queue meanwhile, and a kept note. */
  function restoreOnLoad() {
    const state = restoreSheetLinkState(window.sessionStorage, window.localStorage, userId, hotelId);
    if (state.link && !sourceRef.current) {
      sourceRef.current = state.link.clientRequestId;
      linkRef.current = state.link;
    }
    // A pending choice kept across the reload/navigation: put the typed draft back (the choice then shows).
    if (state.link?.draft && !String(readForm(formRef.current).amount ?? '').trim()) fillForm(state.link.draft);
    const formValues = readForm(formRef.current);
    if (state.goneLink) {
      const gone = sheetSourceGone({ storage: window.localStorage, session: window.sessionStorage, tabId: sheetTabIdentity().id, userId, hotelId, outletId, link: state.goneLink, formValues });
      if (gone) {
        applyGone(gone, state.goneLink.values, state.goneLink.draft);
        return;
      }
    }
    const note = readSheetSentElsewhere(window.sessionStorage, userId, hotelId);
    if (note?.mode === 'gate' && String(formValues.amount ?? '').trim()) {
      setFormAmount(String(formValues.amount));
      setSentElsewhere({ oldAmount: note.oldAmount, byThisTab: Boolean(note.byThisTab) });
    } else if (note?.mode === 'gate') {
      writeNote({ ...note, mode: 'armed' });
    }
  }

  /** Held entry gone after Send/Replace was pressed (another tab handled it): same handling as above. */
  function goneFromChoice(item: LedgerQueueItem, origin: 'send' | 'replace', formAtClick: Record<string, unknown>) {
    if (origin === 'send') {
      // Staff chose the earlier amount; it was sent elsewhere: their edit is intentionally dropped.
      const here = wasSentByThisTab(window.sessionStorage, userId, item.clientRequestId, sheetTabIdentity().id);
      finishChoice(fillSheetCopy(here ? choiceCopy.sentHere : choiceCopy.sentElsewhere, { old: money(item.payload.amount) }), formAtClick);
      return;
    }
    const link = { clientRequestId: item.clientRequestId, values: item.payload };
    const gone = sheetSourceGone({ storage: window.localStorage, session: window.sessionStorage, tabId: sheetTabIdentity().id, userId, hotelId, outletId, link, formValues: readForm(formRef.current) });
    if (gone) applyGone(gone, item.payload, formAtClick);
    else finishChoice(choiceCopy.gone, formAtClick);
  }

  function saveAsNewEntry() {
    setSentElsewhere(null);
    writeNote(null);
    void submit(true);
  }

  function clearAfterSentElsewhere() {
    setSentElsewhere(null);
    writeNote(null);
    formRef.current?.reset();
    setFormAmount('');
    setMessage('');
  }

  function stopWatching() {
    if (watchRef.current) clearInterval(watchRef.current);
    watchRef.current = null;
  }

  /**
   * Another tab is sending the held entry. Keep the choice and the typed amount, and look at the
   * shared device queue until that send is final: back in the queue -> choose again; gone -> resolved;
   * still sending after ~60 s -> the other tab may have closed mid-send: suggest a reload.
   */
  function watchOtherTab(item: LedgerQueueItem, formAtClick: Record<string, unknown>, origin: 'send' | 'replace') {
    stopWatching();
    setMessage(choiceCopy.inFlight);
    let checks = 0;
    watchRef.current = setInterval(() => {
      checks += 1;
      const outcome = sheetInFlightOutcome(sheetQueueState(window.localStorage, userId, item.clientRequestId), checks);
      if (outcome === 'wait') return;
      stopWatching();
      if (outcome === 'gone') goneFromChoice(item, origin, formAtClick);
      else if (outcome === 'stuck') setMessage(choiceCopy.inFlightStuck);
      else setMessage('');
    }, 1500);
  }

  function readForm(formElement: HTMLFormElement | null) {
    return readSheetForm(formElement, { hotelId, businessDate, outletId });
  }

  function clearPending() {
    pendingRef.current = null;
    setCanRetry(false);
  }

  function findHeld(formValues: Record<string, unknown>) {
    return findHeldEntry(formValues, { userId, hotelId, outletId, sourceId: sourceRef.current });
  }

  /** Clear the form only if it still shows these values; an edit typed meanwhile is kept. */
  function resetFormIfStill(values: Record<string, unknown>) {
    if (!sheetFormStillSent(readForm(formRef.current), values, { outletId, hotelId })) return;
    formRef.current?.reset();
    setFormAmount('');
  }

  function money(value: unknown) {
    return currency(Number(value || 0), currencyCode);
  }

  function finishChoice(text: string, formAtClick: Record<string, unknown>, refresh = true) {
    setHeld(null);
    clearPending();
    setSource(null);
    resetFormIfStill(formAtClick);
    setMessage(text);
    if (refresh) router.refresh();
  }

  function onFormInput() {
    const values = readForm(formRef.current);
    setFormAmount(String(values.amount ?? ''));
    if (!String(values.amount ?? '').trim()) {
      // An empty amount ends the link to the earlier entry: what is typed next is a new entry.
      setSource(null);
      setSentElsewhere(null);
      writeNote(null);
      if (held) {
        setHeld(null);
        autoSendRef.current?.soon();
      }
      return;
    }
    // Staff are typing a new entry (not a browser refill): a kept, unshown note no longer applies.
    if (!sentElsewhere && readSheetSentElsewhere(window.sessionStorage, userId, hotelId)?.mode === 'armed') writeNote(null);
    if (!held) return;
    const stillHeld = findHeld(values);
    setHeld(stillHeld);
    persistDraft(stillHeld ? values : null);
    // The form matches the queued entry again (or is empty): back to normal auto-send.
    if (!stillHeld) autoSendRef.current?.soon();
  }

  async function submit(confirmedNew = false) {
    if (sentElsewhere && !confirmedNew) return; // staff must confirm "Save as a new entry" first
    const formValues = readForm(formRef.current);
    // A refilled amount after "already sent from another tab" (even across a reload): show the gate, don't post.
    const note = readSheetSentElsewhere(window.sessionStorage, userId, hotelId);
    if (sheetSaveBlocked(note, formValues, confirmedNew) && note) {
      writeNote({ ...note, mode: 'gate' });
      setFormAmount(String(formValues.amount ?? ''));
      setSentElsewhere({ oldAmount: note.oldAmount, byThisTab: Boolean(note.byThisTab) });
      setMessage('');
      return;
    }
    if (confirmedNew) writeNote(null);
    const waiting = findHeld(formValues);
    if (waiting) {
      setHeld(waiting);
      setFormAmount(String(formValues.amount ?? ''));
      persistDraft(formValues);
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
    busy.start();
    setSaving(true);
    setMessage('');
    try {
      const result = await saveSheetEntryWithQueue(source, { userId, hotelId, outletId, storage: window.localStorage });
      if (result.ok) {
        clearPending();
        setSource(null);
        resetFormIfStill(source.values);
        setMessage(result.duplicate ? 'Entry already saved.' : 'Entry saved.');
        router.refresh();
        return;
      }
      const keep = result.retryable || Boolean(result.needsAttention);
      pendingRef.current = keep ? { clientRequestId: result.clientRequestId, payload: source.values } : null;
      setSource(result.retryable ? { clientRequestId: result.clientRequestId, values: source.values } : null);
      setCanRetry(keep && retryAvailable());
      setMessage(queuedLedgerHint(result.error, result.retryable, Boolean(result.needsAttention)));
    } catch (error) {
      setCanRetry(retryAvailable());
      setMessage(queuedLedgerHint(error instanceof Error ? error.message : "Couldn't save this entry. Check your connection and try again.", true));
    } finally {
      busy.end();
      setSaving(false);
      autoSendRef.current?.soon();
    }
  }

  async function chooseSend() {
    const item = held;
    if (!item) return;
    const formAtClick = readForm(formRef.current);
    // Another tab may be sending it, or have sent or replaced it already: then send nothing.
    const where = sheetQueueState(window.localStorage, userId, item.clientRequestId);
    if (where === 'sending') {
      watchOtherTab(item, formAtClick, 'send');
      return;
    }
    if (where === 'gone') {
      goneFromChoice(item, 'send', formAtClick);
      return;
    }
    busy.start();
    setSaving(true);
    setMessage('');
    try {
      markSentByThisTab(window.sessionStorage, userId, item.clientRequestId, sheetTabIdentity().id);
      const result = await sendHeldSheetEntry(item, { userId, hotelId, outletId, storage: window.localStorage });
      if (result.ok) {
        finishChoice(fillSheetCopy(choiceCopy.saved, { amount: money(item.payload.amount) }), formAtClick);
        return;
      }
      if (!result.retryable && !result.needsAttention) {
        setHeld(null);
        setSource(null);
      }
      setMessage(queuedLedgerHint(result.error, result.retryable, Boolean(result.needsAttention)));
    } finally {
      busy.end();
      setSaving(false);
      autoSendRef.current?.soon();
    }
  }

  async function chooseReplace() {
    const item = held;
    if (!item) return;
    const formValues = readForm(formRef.current);
    busy.start();
    setSaving(true);
    setMessage('');
    try {
      const outcome = await replaceHeldSheetEntry(item, formValues, { userId, hotelId, outletId, storage: window.localStorage });
      if (outcome.kind === 'already_saved') {
        finishChoice(fillSheetCopy(choiceCopy.alreadySaved, { old: money(outcome.amount) }), formValues);
      } else if (outcome.kind === 'replacement_exists') {
        finishChoice(fillSheetCopy(choiceCopy.replacementExists, { amount: money(outcome.amount) }), formValues);
      } else if (outcome.kind === 'replaced') {
        finishChoice(fillSheetCopy(choiceCopy.saved, { amount: money(outcome.amount) }), formValues);
      } else if (outcome.kind === 'gone') {
        goneFromChoice(item, 'replace', formValues);
      } else if (outcome.kind === 'in_flight') {
        watchOtherTab(item, formValues, 'replace');
      } else if ('error' in outcome) {
        // Busy, offline or refused: nothing changed; the choice stays and pressing Replace again is safe.
        setMessage(outcome.error);
      }
    } finally {
      busy.end();
      setSaving(false);
      autoSendRef.current?.soon();
    }
  }

  async function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit();
  }

  // Keep the latest handlers for listeners registered once per user and hotel.
  useEffect(() => {
    actionsRef.current = { checkSource, restoreOnLoad, persistDraft };
  });

  // While a choice is pending here, mark the entry held in localStorage so every tab's auto-send skips it.
  // Refreshed every 30 s; it expires if this tab closes.
  // Only the stamps this page load wrote are cleared (heldMarksThisLoad), never another tab's.
  useEffect(() => {
    if (!held) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const identity = sheetTabIdentity();
    const start = (id: string) => {
      if (stopped) return;
      const mark = () => {
        heldMarksThisLoad.add(held.clientRequestId);
        writeSheetHeldMark(window.localStorage, userId, held.clientRequestId, id);
      };
      mark();
      timer = setInterval(mark, 30_000);
    };
    // Once the id is settled, re-mark in the same task as the previous cleanup, so a re-render that
    // keeps the same entry held never leaves a gap another tab could send in.
    if (identity.settled) start(identity.id);
    else void identity.ready.then(start);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      clearSheetHeldMarks(window.localStorage, userId, identity.id, heldMarksThisLoad);
      heldMarksThisLoad.clear();
    };
  }, [held, userId]);

  useEffect(() => {
    const stop = watchSheetSource({
      win: window,
      doc: document,
      keys: [ledgerQueueStorageKey(userId), sheetLinkKey(userId, hotelId)],
      check: () => actionsRef.current?.checkSource()
    });
    return stop;
  }, [userId, hotelId]);

  // Same auto-send as #33: on load and when the device comes back online, send queued entries.
  useEffect(() => {
    let cancelled = false;
    function showAttention() {
      const attention = needsAttentionLedgerEntries(window.localStorage, userId).filter((item) => item.hotelId === hotelId);
      if (!attention.length) return;
      if (readSheetSentElsewhere(window.sessionStorage, userId, hotelId)?.mode === 'gate') return;
      pendingRef.current = { clientRequestId: attention[0].clientRequestId, payload: attention[0].payload };
      setCanRetry(sheetRetryAvailable({ storage: window.localStorage, userId, pendingId: attention[0].clientRequestId, held: false, gate: false }));
      setMessage(queuedLedgerHint(attention[0].error || LEDGER_NEEDS_ATTENTION_ERROR, false, true));
    }
    async function flush(reason: SheetAutoSendReason): Promise<{ remaining: number }> {
      if (!userId) return { remaining: 0 };
      // Settle the tab id first (a Duplicate-tab copy gets its own) so holds and "sent here" are right.
      const tabId = await sheetTabIdentity().ready;
      const storage = window.localStorage;
      // A save staff started is still running: leave its entry alone and look again shortly.
      if (busy.busy) return { remaining: sheetWaitingCount(readLedgerQueue(storage, userId)) };
      if (reason === 'load') {
        resetStaleSyncingLedgerEntries(storage, userId);
        // After a reload or back/forward: the link to the entry this form came from, and, if another
        // tab sent that entry meanwhile, the same note or gate as when it happens live.
        actionsRef.current?.restoreOnLoad();
      }
      showAttention();
      actionsRef.current?.checkSource();
      const formValues = readSheetForm(formRef.current, { hotelId, businessDate, outletId });
      const waiting = findHeldEntry(formValues, { userId, hotelId, outletId, sourceId: sourceRef.current });
      if (waiting) {
        // The form differs from what is queued: ask, do not send. Keep the typed draft for reloads.
        setHeld(waiting);
        setFormAmount(String(formValues.amount ?? ''));
        actionsRef.current?.persistDraft(formValues);
      }
      // Hold only the one conflicting entry (also when only its kept draft differs), and entries
      // another tab is holding for a choice; everything else queued auto-sends.
      const skipIds = [...new Set([
        ...(waiting ? [waiting.clientRequestId] : []),
        ...sheetAutoSendSkips({ storage, userId, hotelId, outletId, tabId, link: linkRef.current, formValues })
      ])];
      const toSend = pendingLedgerEntries(storage, userId).filter((item) => !skipIds.includes(item.clientRequestId));
      if (!toSend.length) return { remaining: sheetWaitingCount(readLedgerQueue(storage, userId), skipIds) };
      const formMatch = String(formValues.amount ?? '').trim()
        ? toSend.find((item) => item.hotelId === hotelId && sameLedgerRetryPayload(item.payload, formValues, { outletId, hotelId }))
        : undefined;
      // Saving always ends, even if this effect was torn down meanwhile (StrictMode remount, navigation):
      // the results are still applied, so this tab's own send is never mistaken for another tab's.
      await withSheetSaving(busy, setSaving, async () => {
        const result = await syncSheetQueue({
          storage,
          userId,
          skipIds,
          resetStale: false,
          onSend: (id) => markSentByThisTab(window.sessionStorage, userId, id, tabId)
        });
        if (result.synced.length > 0) {
          if (pendingRef.current && result.synced.includes(pendingRef.current.clientRequestId)) clearPending();
          if (sourceRef.current && result.synced.includes(sourceRef.current)) {
            sourceRef.current = null;
            linkRef.current = null;
            writeSheetLink(window.sessionStorage, userId, hotelId, null);
          }
          if (formMatch && result.synced.includes(formMatch.clientRequestId)) {
            // Only if the form still shows what was sent: an edit typed during the send is kept.
            const current = readSheetForm(formRef.current, { hotelId, businessDate, outletId });
            if (sheetFormStillSent(current, formMatch.payload, { outletId, hotelId })) {
              formRef.current?.reset();
              setFormAmount('');
            }
          }
          setMessage(result.synced.length === 1 ? 'Entry saved.' : `${result.synced.length} entries saved.`);
          router.refresh();
        }
        if (result.failed > 0 && result.lastError) {
          setCanRetry(Boolean(pendingRef.current) && sheetRetryAvailable({ storage, userId, pendingId: pendingRef.current?.clientRequestId, held: false, gate: false }));
          setMessage(queuedLedgerHint(result.lastError, true));
        }
        if (!cancelled) showAttention();
      });
      return { remaining: sheetWaitingCount(readLedgerQueue(storage, userId), skipIds) };
    }
    const sender = startSheetAutoSend({ win: window, doc: document, run: flush, isOnline: () => navigator.onLine });
    autoSendRef.current = sender;
    // Another tab's hold went away (released, or expired because that tab closed): send now, even if
    // the timer had disarmed because the held entry was the only thing waiting.
    const holds = watchSheetHeldMarks({
      win: window,
      storage: window.localStorage,
      userId,
      tabId: () => sheetTabIdentity().id,
      onRelease: () => void sender.kick('released')
    });
    void sheetTabIdentity().ready.then(() => holds.check());
    return () => {
      cancelled = true;
      holds.stop();
      sender.stop();
      if (watchRef.current) clearInterval(watchRef.current);
      watchRef.current = null;
      if (autoSendRef.current === sender) autoSendRef.current = null;
    };
  }, [router, userId, hotelId, outletId, businessDate, busy]);

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
          <form ref={formRef} onSubmit={addEntry} onInput={onFormInput} autoComplete="off" className="space-y-3">
            {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm" role="status">{message}</p> : null}
            {sentElsewhere ? (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm" role="alert">
                <p className="font-semibold">{fillSheetCopy(sentElsewhere.byThisTab ? choiceCopy.sentHereEdited : choiceCopy.sentElsewhereEdited, { old: money(sentElsewhere.oldAmount), new: money(formAmount) })}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-secondary" type="button" disabled={saving} onClick={clearAfterSentElsewhere}>{choiceCopy.clearForm}</button>
                  <button className="btn-primary" type="button" disabled={saving || !formAmount.trim()} onClick={saveAsNewEntry}>
                    {fillSheetCopy(choiceCopy.saveAsNew, { new: money(formAmount) })}
                  </button>
                </div>
              </div>
            ) : null}
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
              <select name="category" className="w-full" defaultValue="other" autoComplete="off">
                {SHEET_ENTRY_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">Amount
                <input name="amount" type="number" step="0.01" required className="w-full" autoComplete="off" />
              </label>
              <label className="block space-y-1">Paid by
                <select name="payment_method" className="w-full" defaultValue="cash" autoComplete="off">
                  {SHEET_ENTRY_METHODS.map((method) => <option key={method} value={method}>{plain(method)}</option>)}
                </select>
              </label>
            </div>
            <label className="block space-y-1">Note (optional)
              <input name="description" className="w-full" autoComplete="off" />
            </label>
            <button className="btn-primary w-full" type="submit" disabled={saving || Boolean(held) || Boolean(sentElsewhere)}>{saving ? 'Saving…' : 'Save entry'}</button>
            {canRetry && !saving && !held && !sentElsewhere ? (
              <button className="btn-secondary w-full" type="button" onClick={() => void submit()}>Retry</button>
            ) : null}
          </form>
        )}
      </div>
    </section>
  );
}
