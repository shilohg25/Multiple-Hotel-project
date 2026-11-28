import {
  closeFiguresFromCounts,
  countRowsFromMap,
  figuresFromLedger,
  resolveReturnToFund,
  summarizeClose,
  type CloseFigures,
  type CloseSummary,
  type LedgerLike
} from './day-close.ts';
import {
  buildLedgerPayload,
  isLockedDayLedgerError,
  ledgerSaveFailureMessage,
  readLedgerQueue,
  pendingLedgerEntries,
  removeLedgerQueueItem,
  resetStaleSyncingLedgerEntries,
  sameLedgerRetryPayload,
  saveLedgerEntryWithQueue,
  LEDGER_NETWORK_ERROR,
  LEDGER_SAVE_TIMEOUT_MS,
  type LedgerQueueItem,
  type PostLedgerResult,
  type StorageLike
} from './ledger-entry-queue.ts';
import { fetchJsonWithTimeout, isNetworkError } from './fetch-timeout.ts';

/**
 * One daily cash sheet.
 *
 * The sheet only changes what staff see and type. It never changes close math:
 * every figure still comes from figuresFromLedger -> closeFiguresFromCounts -> summarizeClose
 * over the FULL ledger row set, exactly like POST /api/day-closes.
 */

export type SheetLedgerRow = LedgerLike & {
  id?: string;
  description?: string | null;
  reservation_id?: string | null;
  created_at?: string | null;
};

export type SheetSplit<Row extends SheetLedgerRow> = {
  /** Rows the app wrote itself (confirmed room payments). Read-only on the sheet. */
  fromApp: Row[];
  /** Rows staff typed on the sheet (walk-in, restaurant, add-on, expense, collectible...). */
  typed: Row[];
  fromAppTotal: number;
  fromAppByMethod: { method: string; amount: number }[];
  typedTotal: number;
};

function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** A ledger row the app wrote itself: it is tied to a stay (confirmed payment / staff down payment). */
export function isFromApp(row: SheetLedgerRow): boolean {
  return Boolean(row.reservation_id);
}

/** Display split only. The close always reads every row, so this cannot change any figure. */
export function splitSheetLedger<Row extends SheetLedgerRow>(rows: Row[]): SheetSplit<Row> {
  const fromApp = rows.filter(isFromApp);
  const typed = rows.filter((row) => !isFromApp(row));
  const byMethod = new Map<string, number>();
  for (const row of fromApp) {
    const method = String(row.payment_method || 'other');
    byMethod.set(method, money((byMethod.get(method) || 0) + Number(row.amount || 0)));
  }
  return {
    fromApp,
    typed,
    fromAppTotal: money(fromApp.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
    fromAppByMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })),
    typedTotal: money(typed.reduce((sum, row) => sum + Number(row.amount || 0), 0))
  };
}

export type SavedCloseRow = {
  float_counted?: number | string | null;
  drawer_counted?: number | string | null;
  bank_deposit?: number | string | null;
  return_to_fund?: number | string | null;
} | null;

/**
 * Base close figures for the sheet. Same inputs and same steps the old Close the day page used:
 * the ledger for hotel/date/outlet, the hotel's RVF float, then the saved close (if any).
 * Pass both split halves back in (or the raw rows); order does not matter.
 */
export function sheetBaseFigures(rows: SheetLedgerRow[], rvfFloat: number, saved: SavedCloseRow): CloseFigures {
  const figures = figuresFromLedger(rows, rvfFloat);
  if (saved) {
    figures.floatCounted = Number(saved.float_counted || 0);
    figures.drawerCounted = Number(saved.drawer_counted || 0);
    figures.bankDeposit = Number(saved.bank_deposit || 0);
    figures.returnToFund = Number(saved.return_to_fund ?? figures.expenses);
  }
  return figures;
}

/** Starting Return to fund on the sheet. Same rule the old close form used. */
export function sheetInitialReturnToFund(saved: SavedCloseRow, base: CloseFigures): number {
  const provided = saved?.return_to_fund;
  return resolveReturnToFund(provided === null || provided === undefined ? provided : Number(provided), base.returnToFund);
}

/**
 * Return to fund the sheet uses right now.
 * - Staff typed a value: keep it.
 * - A saved close has a value (even 0): keep it.
 * - Otherwise follow the current default from the ledger figures (the expenses), so an expense
 *   typed on the same sheet updates it, exactly like the old Close the day page did on a fresh load.
 */
export function sheetReturnToFund(saved: SavedCloseRow, base: CloseFigures, edited: number | null): number {
  if (edited !== null) return edited;
  return sheetInitialReturnToFund(saved, base);
}

/** Live preview of the one count. Same helpers, same order as POST /api/day-closes. */
export function sheetCloseSummary(
  base: CloseFigures,
  input: {
    floatCounts: Record<number, number>;
    drawerCounts: Record<number, number>;
    bankDeposit: number | null | undefined;
    returnToFund: number | null | undefined;
  }
): CloseSummary {
  return summarizeClose(closeFiguresFromCounts(base, {
    floatCounts: countRowsFromMap(input.floatCounts),
    drawerCounts: countRowsFromMap(input.drawerCounts),
    bankDeposit: input.bankDeposit,
    returnToFund: input.returnToFund
  }));
}

/**
 * Categories staff may type on the sheet. Room and Room payment are left out on purpose:
 * confirmed payments already write those rows. The API still accepts every old category,
 * and older typed rows still count in the close.
 */
export const SHEET_ENTRY_CATEGORIES = [
  { value: 'other', label: 'Walk-in or restaurant sale' },
  { value: 'add_on', label: 'Add-on sold at the desk' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'expense', label: 'Expense (paid from the drawer)' },
  { value: 'collectible', label: 'Not paid yet (collectible)' }
] as const;

export const SHEET_ENTRY_METHODS = ['cash', 'gcash', 'maya', 'bank_transfer', 'card', 'cheque', 'online_gateway', 'booking_dot_com', 'trip_dot_com', 'other'] as const;

/** The entry fields read from the sheet form, without any request id. */
export function sheetEntryPayload(
  fields: { category?: unknown; description?: unknown; amount?: unknown; payment_method?: unknown },
  scope: { hotelId: string; businessDate: string; outletId?: string | null }
): Record<string, unknown> {
  const category = String(fields.category || 'other');
  const payload: Record<string, unknown> = {
    hotel_id: scope.hotelId,
    entry_date: scope.businessDate,
    category,
    description: String(fields.description || ''),
    amount: fields.amount ?? '',
    payment_method: fields.payment_method || 'cash',
    is_collectible: category === 'collectible' ? 'true' : 'false'
  };
  if (scope.outletId) payload.outlet_id = scope.outletId;
  return payload;
}

export type SheetPendingEntry = { clientRequestId: string; payload: Record<string, unknown> } | null;

/**
 * What Save entry / Retry sends, using PR #33's ledger queue (hotel_ops_ledger_entry_queue:<userId>).
 * - The form has an amount: send the form as it is NOW. #33's resolveLedgerClientRequestId keeps the
 *   pending client_request_id only when the entry is unchanged; an edited entry gets a new id and the
 *   old queued copy is dropped.
 * - The form is empty (for example after a reload) and an entry is still queued on this device:
 *   send that queued entry with its own id.
 */
export function sheetRetrySource(input: {
  formValues: Record<string, unknown>;
  pending: SheetPendingEntry;
  queued: LedgerQueueItem[];
}): { values: Record<string, unknown>; clientRequestId?: string; previousPayload: Record<string, unknown> | null } | null {
  const amount = String(input.formValues.amount ?? '').trim();
  if (amount) {
    return {
      values: input.formValues,
      clientRequestId: input.pending?.clientRequestId,
      previousPayload: input.pending?.payload ?? null
    };
  }
  const item = input.queued.find((entry) => entry.clientRequestId === input.pending?.clientRequestId) || input.queued[0];
  if (!item) return null;
  return { values: item.payload, clientRequestId: item.clientRequestId, previousPayload: item.payload };
}

/** One sheet save through #33's queue. Same timeout, dedupe and queue rules as the old Daily sales form. */
export function saveSheetEntryWithQueue(
  source: { values: Record<string, unknown>; clientRequestId?: string; previousPayload: Record<string, unknown> | null },
  options: { userId: string; hotelId: string; outletId?: string | null; storage: StorageLike; timeoutMs?: number; fetchImpl?: typeof fetch; createId?: () => string }
): Promise<PostLedgerResult> {
  return saveLedgerEntryWithQueue(source.values, {
    clientRequestId: source.clientRequestId,
    previousPayload: source.previousPayload,
    outletId: options.outletId,
    userId: options.userId,
    hotelId: options.hotelId,
    storage: options.storage,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    createId: options.createId
  });
}

/**
 * Option (a): staff saved an entry, it did not reach the server and is still queued, and they then
 * changed the form (650 timed out, form edited to 560).
 *
 * "Conflicting" means exactly one entry: the one the current form came from, i.e. the last save from
 * this form that failed and is still queued (sourceId). Only that entry is held and only while the form
 * has an amount that differs from it. Every other queued entry auto-sends as usual, and once staff
 * empty the amount (or the source leaves the queue) the form is a new entry and Save works normally.
 */
export function sheetHeldEntry(input: {
  formValues: Record<string, unknown>;
  queued: LedgerQueueItem[];
  hotelId: string;
  outletId?: string | null;
  sourceId?: string | null;
}): LedgerQueueItem | null {
  if (!input.sourceId) return null;
  if (!String(input.formValues.amount ?? '').trim()) return null;
  const source = input.queued.find((item) => item.clientRequestId === input.sourceId && item.hotelId === input.hotelId);
  if (!source) return null;
  if (sameLedgerRetryPayload(source.payload, input.formValues, { outletId: input.outletId, hotelId: input.hotelId })) return null;
  return source;
}

/**
 * Where this entry is in the device queue (shared by all tabs):
 * 'queued' waiting here, 'sending' another tab (or this one) is sending it right now, 'gone' sent or replaced.
 */
export function sheetQueueState(storage: StorageLike, userId: string, clientRequestId: string): 'queued' | 'sending' | 'gone' {
  const item = readLedgerQueue(storage, userId).find((entry) => entry.clientRequestId === clientRequestId);
  if (!item) return 'gone';
  return item.status === 'syncing' ? 'sending' : 'queued';
}

/** True while this entry is still waiting in the device queue (not gone and not being sent right now). */
export function sheetEntryStillQueued(storage: StorageLike, userId: string, clientRequestId: string) {
  return sheetQueueState(storage, userId, clientRequestId) === 'queued';
}

/**
 * The link from the form to the queued entry it came from, kept in sessionStorage per user and hotel so a
 * reload or back/forward keeps it (the browser may refill the form). Values are a snapshot of what was sent.
 */
export type SheetFormLink = {
  clientRequestId: string;
  /** What was sent (the queued entry). */
  values: Record<string, unknown>;
  /** The edit staff typed while the choice was pending; restored after a reload or back/forward. */
  draft?: Record<string, unknown> | null;
};

export function sheetLinkKey(userId: string, hotelId: string) {
  return `hotel_ops_sheet_form_link:${userId}:${hotelId}`;
}

export function writeSheetLink(session: StorageLike, userId: string, hotelId: string, link: SheetFormLink | null) {
  try {
    if (link) session.setItem(sheetLinkKey(userId, hotelId), JSON.stringify(link));
    else session.removeItem(sheetLinkKey(userId, hotelId));
  } catch {
    // Private mode or a full store: the in-memory link still works for this page.
  }
}

/** The saved link as stored (no clean-up, no queue check). */
export function readSheetLink(session: StorageLike, userId: string, hotelId: string): SheetFormLink | null {
  try {
    const raw = session.getItem(sheetLinkKey(userId, hotelId));
    const parsed = raw ? JSON.parse(raw) as Partial<SheetFormLink> : null;
    if (parsed && typeof parsed.clientRequestId === 'string' && parsed.values && typeof parsed.values === 'object') {
      const draft = parsed.draft && typeof parsed.draft === 'object' ? parsed.draft as Record<string, unknown> : null;
      return { clientRequestId: parsed.clientRequestId, values: parsed.values as Record<string, unknown>, draft };
    }
  } catch {
    // Unreadable: no link.
  }
  return null;
}

/**
 * On load: the entry whose Send/Replace choice was pending when this tab left the page (its kept draft
 * differs from what is still queued), or null. Read-only, so the normal restore still sees the link.
 */
export function sheetPendingChoiceId(input: { session: StorageLike; storage: StorageLike; userId: string; hotelId: string; outletId?: string | null }) {
  const link = readSheetLink(input.session, input.userId, input.hotelId);
  if (!link?.draft || !String(link.draft.amount ?? '').trim()) return null;
  if (sheetQueueState(input.storage, input.userId, link.clientRequestId) === 'gone') return null;
  if (sameLedgerRetryPayload(link.values, link.draft, { outletId: input.outletId, hotelId: input.hotelId })) return null;
  return link.clientRequestId;
}

/** The saved link, only while its entry is still in the device queue; a stale link is removed. */
export function restoreSheetLink(session: StorageLike, queue: StorageLike, userId: string, hotelId: string): SheetFormLink | null {
  return restoreSheetLinkState(session, queue, userId, hotelId).link;
}

/**
 * On load: the saved link, split into
 * - link: its entry is still queued (or being sent), keep holding it;
 * - goneLink: its entry left the queue while this page was away (another tab sent it). The link is
 *   removed from storage, but returned so the caller can compare the (maybe refilled) form with what
 *   was sent and show the "already sent from another tab" note or gate instead of dropping it silently.
 */
export function restoreSheetLinkState(
  session: StorageLike,
  queue: StorageLike,
  userId: string,
  hotelId: string
): { link: SheetFormLink | null; goneLink: SheetFormLink | null } {
  const link = readSheetLink(session, userId, hotelId);
  if (!link) {
    writeSheetLink(session, userId, hotelId, null);
    return { link: null, goneLink: null };
  }
  if (sheetQueueState(queue, userId, link.clientRequestId) === 'gone') {
    writeSheetLink(session, userId, hotelId, null);
    return { link: null, goneLink: link };
  }
  return { link, goneLink: null };
}

/**
 * "Already sent from another tab" kept in sessionStorage until staff dismiss it, so a reload or
 * back/forward cannot turn a refilled edit into a silent second row.
 * - 'gate': the form showed an edit; Save is blocked until "Save as a new entry" or "Clear form".
 * - 'armed': the form was empty or unchanged; if a refilled amount is saved without typing, the gate shows.
 */
export type SheetSentElsewhere = { mode: 'gate' | 'armed'; oldAmount: number; values: Record<string, unknown>; byThisTab?: boolean };

export function sheetSentElsewhereKey(userId: string, hotelId: string) {
  return `hotel_ops_sheet_sent_elsewhere:${userId}:${hotelId}`;
}

export function writeSheetSentElsewhere(session: StorageLike, userId: string, hotelId: string, note: SheetSentElsewhere | null) {
  try {
    if (note) session.setItem(sheetSentElsewhereKey(userId, hotelId), JSON.stringify(note));
    else session.removeItem(sheetSentElsewhereKey(userId, hotelId));
  } catch {
    // Private mode or a full store: the in-memory gate still works for this page.
  }
}

export function readSheetSentElsewhere(session: StorageLike, userId: string, hotelId: string): SheetSentElsewhere | null {
  try {
    const raw = session.getItem(sheetSentElsewhereKey(userId, hotelId));
    const parsed = raw ? JSON.parse(raw) as Partial<SheetSentElsewhere> : null;
    if (!parsed || (parsed.mode !== 'gate' && parsed.mode !== 'armed')) return null;
    return { mode: parsed.mode, oldAmount: Number(parsed.oldAmount || 0), values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {}, byThisTab: parsed.byThisTab === true };
  } catch {
    return null;
  }
}

/** A plain Save (not "Save as a new entry") must show the gate instead of posting. */
export function sheetSaveBlocked(note: SheetSentElsewhere | null, formValues: Record<string, unknown>, confirmedNew: boolean) {
  if (confirmedNew || !note) return false;
  return Boolean(String(formValues.amount ?? '').trim());
}

/** Retry only makes sense while its entry is still in the device queue and no gate or choice is showing. */
export function sheetRetryAvailable(input: { storage: StorageLike; userId: string; pendingId: string | null | undefined; held: boolean; gate: boolean }) {
  if (!input.pendingId || input.held || input.gate) return false;
  return sheetQueueState(input.storage, input.userId, input.pendingId) !== 'gone';
}

/** Max checks (x 1.5 s) while another tab sends the held entry; after that its sending mark may be stuck. */
export const SHEET_IN_FLIGHT_MAX_CHECKS = 40;

/** One check of another tab's send: keep waiting, stuck (show a reload hint), back in the queue, or gone. */
export function sheetInFlightOutcome(where: 'queued' | 'sending' | 'gone', checks: number, maxChecks = SHEET_IN_FLIGHT_MAX_CHECKS) {
  if (where === 'sending') return checks < maxChecks ? 'wait' as const : 'stuck' as const;
  return where;
}

/**
 * After a save finished: clear the form only if it still shows what was sent.
 * An edit typed while the save was running is kept.
 */
export function sheetFormStillSent(
  currentValues: Record<string, unknown>,
  sentValues: Record<string, unknown>,
  options: { outletId?: string | null; hotelId?: string }
) {
  return sameLedgerRetryPayload(sentValues, currentValues, options);
}

/** #33's auto-send, except for entries staff still have to choose about. */
export async function syncSheetQueue(options: {
  storage: StorageLike;
  userId: string;
  skipIds?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
  /** Turn 'syncing' left over from a closed page back into 'pending'. Only on load: mid-session a 'syncing' entry is in flight. */
  resetStale?: boolean;
  /** Called just before an entry is sent, so the page can record "this tab sent it". */
  onSend?: (clientRequestId: string) => void;
}): Promise<{ synced: string[]; failed: number; lastError: string | null }> {
  const result = { synced: [] as string[], failed: 0, lastError: null as string | null };
  if (options.isOnline && !options.isOnline()) return { ...result, lastError: LEDGER_NETWORK_ERROR };
  if (options.resetStale !== false) resetStaleSyncingLedgerEntries(options.storage, options.userId);
  const skip = new Set(options.skipIds || []);
  for (const item of pendingLedgerEntries(options.storage, options.userId)) {
    if (skip.has(item.clientRequestId)) continue;
    options.onSend?.(item.clientRequestId);
    const saved = await saveLedgerEntryWithQueue(item.payload, {
      clientRequestId: item.clientRequestId,
      userId: options.userId,
      hotelId: item.hotelId,
      storage: options.storage,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
      now: () => item.createdAt
    });
    if (saved.ok) result.synced.push(item.clientRequestId);
    else {
      result.failed += 1;
      result.lastError = saved.error;
    }
  }
  return result;
}

type SheetSendOptions = {
  userId: string;
  hotelId: string;
  outletId?: string | null;
  storage: StorageLike;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  createId?: () => string;
};

/** "Send ₱650": the queued entry, unchanged, with its original client_request_id. */
export function sendHeldSheetEntry(item: LedgerQueueItem, options: SheetSendOptions): Promise<PostLedgerResult> {
  return saveSheetEntryWithQueue(
    { values: item.payload, clientRequestId: item.clientRequestId, previousPayload: item.payload },
    { ...options, hotelId: item.hotelId || options.hotelId }
  );
}

export type SheetReplaceResult =
  | { kind: 'already_saved' | 'replaced' | 'replacement_exists'; amount: number }
  | { kind: 'gone' | 'in_flight' }
  | { kind: 'busy' | 'offline' | 'error'; error: string };

/**
 * "Replace with ₱560": one call, PATCH /api/ledger { action: 'replace' }. The server enforces one row:
 * - earlier entry already saved: nothing inserted ('already_saved', staff use an adjustment);
 * - otherwise it retires the earlier id and inserts the correction under an id it derives from it,
 *   so a second tab or a retry gets the existing replacement ('replacement_exists'), even for another amount.
 * Before sending, the device queue is read again: if another tab already handled this entry, nothing is sent.
 * If the server can't be reached, nothing changes here and pressing Replace again is safe.
 */
export async function replaceHeldSheetEntry(
  item: LedgerQueueItem,
  formValues: Record<string, unknown>,
  options: SheetSendOptions
): Promise<SheetReplaceResult> {
  const where = sheetQueueState(options.storage, options.userId, item.clientRequestId);
  if (where === 'gone') return { kind: 'gone' };
  // Another tab is sending this entry right now: wait for its answer, change nothing.
  if (where === 'sending') return { kind: 'in_flight' };
  const hotelId = item.hotelId || options.hotelId;
  const entry = buildLedgerPayload(formValues, { outletId: options.outletId, hotelId, clientRequestId: '_' });
  delete entry.client_request_id;
  let json: Record<string, unknown> = {};
  try {
    const answer = await fetchJsonWithTimeout('/api/ledger', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'replace', hotel_id: hotelId, client_request_id: item.clientRequestId, entry })
    }, { timeoutMs: options.timeoutMs ?? LEDGER_SAVE_TIMEOUT_MS, fetchImpl: options.fetchImpl });
    json = answer.json && typeof answer.json === 'object' ? answer.json as Record<string, unknown> : {};
    if (!answer.response.ok) {
      const error = typeof json.error === 'string' ? json.error : 'Could not replace the earlier entry.';
      return { kind: answer.response.status === 409 && !isLockedDayLedgerError(error) ? 'busy' : 'error', error };
    }
  } catch (error) {
    return { kind: isNetworkError(error) ? 'offline' : 'error', error: ledgerSaveFailureMessage(error) };
  }

  const status = json.status;
  if (status !== 'already_saved' && status !== 'replaced' && status !== 'replacement_exists') {
    return { kind: 'error', error: 'Could not replace the earlier entry.' };
  }
  removeLedgerQueueItem(options.storage, options.userId, item.clientRequestId);
  const saved = json.entry && typeof json.entry === 'object' ? json.entry as { amount?: unknown } : {};
  const amount = status === 'already_saved' ? Number(item.payload.amount || 0) : Number(saved.amount ?? formValues.amount ?? 0);
  return { kind: status, amount };
}

/** Fill {old} and {new} in a translated sentence with the real amounts. */
export function fillSheetCopy(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key] : match));
}

/** Entries still waiting to be auto-sent (pending, failed or backing off), minus the ones staff must choose about. */
export function sheetWaitingCount(queued: LedgerQueueItem[], skipIds: string[] = []) {
  const skip = new Set(skipIds);
  return queued.filter((item) => (item.status === 'pending' || item.status === 'failed' || item.status === 'syncing') && !skip.has(item.clientRequestId)).length;
}

export type SheetSourceGone = { kind: 'unchanged' | 'edited'; oldAmount: number; newAmount: string; byThisTab?: boolean };

/**
 * The entry this form came from left the device queue without this tab doing it (another tab sent it).
 * Returns null while it is still queued or being sent (the in-flight path handles that).
 * 'unchanged': the form still shows what was sent. 'edited': staff changed it; that edit was NOT saved.
 */
export function sheetSourceGone(input: {
  storage: StorageLike;
  userId: string;
  hotelId: string;
  outletId?: string | null;
  link: SheetFormLink | null;
  formValues: Record<string, unknown>;
  /** This tab's sessionStorage and id: did this tab (any page of it) send the entry? */
  session?: StorageLike;
  tabId?: string;
}): SheetSourceGone | null {
  if (!input.link) return null;
  if (sheetQueueState(input.storage, input.userId, input.link.clientRequestId) !== 'gone') return null;
  // An empty form after a reload or back/forward: compare the kept draft instead.
  const typed = String(input.formValues.amount ?? '').trim();
  const values = !typed && input.link.draft ? input.link.draft : input.formValues;
  const newAmount = String(values.amount ?? '').trim();
  const unchanged = !newAmount || sameLedgerRetryPayload(input.link.values, values, { outletId: input.outletId, hotelId: input.hotelId });
  const byThisTab = input.session && input.tabId ? wasSentByThisTab(input.session, input.userId, input.link.clientRequestId, input.tabId) : false;
  return { kind: unchanged ? 'unchanged' : 'edited', oldAmount: Number(input.link.values.amount || 0), newAmount, byThisTab };
}

function sentHereKey(userId: string) {
  return `hotel_ops_sheet_sent_here:${userId}`;
}

/**
 * "This tab sent it", stamped with the tab id. Duplicate tab copies sessionStorage, but the copy gets a
 * new tab id (lib/sheet-tab-id.ts), so it never claims the original's sends.
 */
function readSentHere(session: StorageLike, userId: string, tabId: string): string[] {
  const raw = session.getItem(sentHereKey(userId));
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { tabId?: unknown; ids?: unknown } | unknown[];
  // Older format (a bare list) has no owner: trust nobody's claim.
  if (!parsed || Array.isArray(parsed) || parsed.tabId !== tabId || !Array.isArray(parsed.ids)) return [];
  return parsed.ids.filter((id): id is string => typeof id === 'string');
}

/** Record that this tab is sending (or sent) the entry, before the request goes out. */
export function markSentByThisTab(session: StorageLike, userId: string, clientRequestId: string, tabId: string) {
  try {
    const ids = readSentHere(session, userId, tabId);
    if (!ids.includes(clientRequestId)) ids.push(clientRequestId);
    session.setItem(sentHereKey(userId), JSON.stringify({ tabId, ids: ids.slice(-50) }));
  } catch {
    // Nothing to record into: the note then says "another tab", the safe direction.
  }
}

export function wasSentByThisTab(session: StorageLike, userId: string, clientRequestId: string, tabId: string) {
  try {
    return readSentHere(session, userId, tabId).includes(clientRequestId);
  } catch {
    return false;
  }
}

/**
 * "A choice is pending on this entry in tab X": in localStorage so every tab's auto-send skips it.
 * Each holding tab has its own stamp per entry (a duplicate holding the same entry does not
 * overwrite the original's). The holder refreshes it; it expires (ttl) if that tab closed.
 */
export const SHEET_HELD_MARK_TTL_MS = 90_000;
/** A released hold is re-checked after this long before other tabs auto-send (a reload re-marks within it). */
export const SHEET_HELD_RELEASE_DEBOUNCE_MS = 1_000;

export function sheetHeldMarkKey(userId: string) {
  return `hotel_ops_sheet_held:${userId}`;
}

/** clientRequestId -> tabId -> when that tab last confirmed it is holding it. */
type HeldMarks = Record<string, Record<string, number>>;

function readHeldMarks(storage: StorageLike, userId: string): HeldMarks {
  try {
    const raw = storage.getItem(sheetHeldMarkKey(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const marks: HeldMarks = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const old = value as { tabId?: unknown; at?: unknown };
      // d9d0f07 format: { tabId, at }.
      if (typeof old.tabId === 'string') marks[id] = { [old.tabId]: Number(old.at || 0) };
      else {
        const holders: Record<string, number> = {};
        for (const [tab, at] of Object.entries(value as Record<string, unknown>)) holders[tab] = Number(at || 0);
        marks[id] = holders;
      }
    }
    return marks;
  } catch {
    return {};
  }
}

function writeHeldMarks(storage: StorageLike, userId: string, marks: HeldMarks) {
  try {
    if (Object.keys(marks).length) storage.setItem(sheetHeldMarkKey(userId), JSON.stringify(marks));
    else storage.removeItem(sheetHeldMarkKey(userId));
  } catch { /* best effort */ }
}

function pruneHeldMarks(marks: HeldMarks, now: number, ttlMs: number) {
  for (const [id, holders] of Object.entries(marks)) {
    for (const [tab, at] of Object.entries(holders)) if (now - at >= ttlMs) delete holders[tab];
    if (!Object.keys(holders).length) delete marks[id];
  }
  return marks;
}

/** Mark (or refresh) this tab's hold on an entry; expired stamps of any tab are pruned on the way. */
export function writeSheetHeldMark(storage: StorageLike, userId: string, clientRequestId: string, tabId: string, now = Date.now(), ttlMs = SHEET_HELD_MARK_TTL_MS) {
  const marks = pruneHeldMarks(readHeldMarks(storage, userId), now, ttlMs);
  marks[clientRequestId] = { ...(marks[clientRequestId] ?? {}), [tabId]: now };
  writeHeldMarks(storage, userId, marks);
}

/**
 * On load, before the duplicate-tab probe: re-stamp the pending choice's entry under the stored tab id
 * at once. Returns that stamp's earlier time (null if there was none) for rekeySheetHeldMark.
 */
export function holdSheetEntryOnLoad(storage: StorageLike, userId: string, clientRequestId: string, tabId: string, now = Date.now()) {
  const before = readHeldMarks(storage, userId)[clientRequestId]?.[tabId];
  writeSheetHeldMark(storage, userId, clientRequestId, tabId, now);
  return typeof before === 'number' ? before : null;
}

/**
 * The probe gave this tab a new id (it was a duplicate): move the load-time stamp to the new id, and put
 * the old id's stamp back as it was (it belongs to the original tab, which keeps refreshing it).
 */
export function rekeySheetHeldMark(storage: StorageLike, userId: string, clientRequestId: string, fromTab: string, toTab: string, previousAt: number | null, now = Date.now()) {
  if (fromTab === toTab) return;
  const marks = readHeldMarks(storage, userId);
  const holders = { ...(marks[clientRequestId] ?? {}) };
  if (previousAt === null) delete holders[fromTab];
  else holders[fromTab] = previousAt;
  holders[toTab] = now;
  marks[clientRequestId] = holders;
  writeHeldMarks(storage, userId, pruneHeldMarks(marks, now, SHEET_HELD_MARK_TTL_MS));
}

/**
 * Drop this tab's stamps on the entries it marked in THIS page load (tracked in memory by the caller),
 * never other tabs' stamps, even if they share the id.
 */
export function clearSheetHeldMarks(storage: StorageLike, userId: string, tabId: string, clientRequestIds: Iterable<string>) {
  const marks = readHeldMarks(storage, userId);
  let changed = false;
  for (const id of clientRequestIds) {
    if (marks[id] && tabId in marks[id]) {
      delete marks[id][tabId];
      if (!Object.keys(marks[id]).length) delete marks[id];
      changed = true;
    }
  }
  if (changed) writeHeldMarks(storage, userId, marks);
}

/** Entries some other live tab is holding for a choice: auto-send must skip them. */
export function sheetHeldElsewhere(storage: StorageLike, userId: string, tabId: string, now = Date.now(), ttlMs = SHEET_HELD_MARK_TTL_MS) {
  return Object.entries(readHeldMarks(storage, userId))
    .filter(([, holders]) => Object.entries(holders).some(([tab, at]) => tab !== tabId && now - at < ttlMs))
    .map(([id]) => id);
}

/** When the next other-tab hold expires (ms timestamp), or null if none. */
export function nextSheetHeldExpiry(storage: StorageLike, userId: string, tabId: string, now = Date.now(), ttlMs = SHEET_HELD_MARK_TTL_MS) {
  let next: number | null = null;
  for (const holders of Object.values(readHeldMarks(storage, userId))) {
    for (const [tab, at] of Object.entries(holders)) {
      if (tab === tabId || now - at >= ttlMs) continue;
      const expires = at + ttlMs;
      if (next === null || expires < next) next = expires;
    }
  }
  return next;
}

/**
 * Start an auto-send pass when another tab's hold goes away: on the storage event for the held-mark
 * key (cleared or released), and at the expiry time of the next hold (a tab that closed without
 * cleaning up). A refresh that keeps the same entries held does not trigger anything.
 */
export function watchSheetHeldMarks(options: {
  win: { addEventListener(type: string, listener: (event: Event) => void): void; removeEventListener(type: string, listener: (event: Event) => void): void };
  storage: StorageLike;
  userId: string;
  tabId: () => string;
  onRelease: () => void;
  now?: () => number;
  ttlMs?: number;
  /** Wait this long after a release, then re-check the marks, before starting a send. */
  debounceMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}) {
  const debounceMs = options.debounceMs ?? SHEET_HELD_RELEASE_DEBOUNCE_MS;
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? SHEET_HELD_MARK_TTL_MS;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const key = sheetHeldMarkKey(options.userId);
  let timer: unknown = null;
  let debounce: unknown = null;
  let stopped = false;
  /** Entries seen released, waiting for the debounce re-check. */
  const released = new Set<string>();
  const heldNow = () => new Set(sheetHeldElsewhere(options.storage, options.userId, options.tabId(), now(), ttlMs));
  let last = heldNow();

  function schedule() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (stopped) return;
    const next = nextSheetHeldExpiry(options.storage, options.userId, options.tabId(), now(), ttlMs);
    if (next === null) return;
    timer = setTimer(() => {
      timer = null;
      check();
    }, Math.max(0, next - now()) + 50);
  }

  function settle() {
    debounce = null;
    if (stopped) return;
    // Re-check: a holder that reloaded (or re-marked) in the meantime holds it again: no send.
    const current = heldNow();
    last = current;
    schedule();
    const stillReleased = [...released].some((id) => !current.has(id));
    released.clear();
    if (stillReleased) options.onRelease();
  }

  function check() {
    if (stopped) return;
    const current = heldNow();
    for (const id of last) if (!current.has(id)) released.add(id);
    for (const id of current) released.delete(id);
    last = current;
    schedule();
    if (released.size && debounce === null) debounce = setTimer(settle, debounceMs);
  }

  const onStorage = (event: Event) => {
    const changed = (event as Event & { key?: string | null }).key;
    if (changed == null || changed === key) check();
  };
  options.win.addEventListener('storage', onStorage);
  schedule();
  return {
    /** Re-read now (e.g. after this tab's identity settled). */
    check,
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      if (debounce !== null) clearTimer(debounce);
      timer = null;
      debounce = null;
      options.win.removeEventListener('storage', onStorage);
    }
  };
}

/** Entries to keep out of an auto-send pass: the one held here (form or kept draft differs) and those held in other tabs. */
export function sheetAutoSendSkips(input: {
  storage: StorageLike;
  userId: string;
  hotelId: string;
  outletId?: string | null;
  tabId: string;
  link: SheetFormLink | null;
  formValues: Record<string, unknown>;
  now?: number;
}) {
  const skips = new Set(sheetHeldElsewhere(input.storage, input.userId, input.tabId, input.now));
  const link = input.link;
  if (link) {
    const typed = String(input.formValues.amount ?? '').trim();
    const values = typed ? input.formValues : link.draft;
    if (values && String(values.amount ?? '').trim() && !sameLedgerRetryPayload(link.values, values, { outletId: input.outletId, hotelId: input.hotelId })) {
      skips.add(link.clientRequestId);
    }
  }
  return [...skips];
}

/** Run one send with the busy gate and the Saving state, and always end both, whatever happens. */
export async function withSheetSaving<T>(
  gate: { start(): void; end(): void },
  setSaving: (value: boolean) => void,
  work: () => Promise<T>
): Promise<T> {
  gate.start();
  setSaving(true);
  try {
    return await work();
  } finally {
    gate.end();
    setSaving(false);
  }
}
