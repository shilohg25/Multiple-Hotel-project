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
export type SheetFormLink = { clientRequestId: string; values: Record<string, unknown> };

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

/** The saved link, only while its entry is still in the device queue; a stale link is removed. */
export function restoreSheetLink(session: StorageLike, queue: StorageLike, userId: string, hotelId: string): SheetFormLink | null {
  let link: SheetFormLink | null = null;
  try {
    const raw = session.getItem(sheetLinkKey(userId, hotelId));
    const parsed = raw ? JSON.parse(raw) as Partial<SheetFormLink> : null;
    if (parsed && typeof parsed.clientRequestId === 'string' && parsed.values && typeof parsed.values === 'object') {
      link = { clientRequestId: parsed.clientRequestId, values: parsed.values as Record<string, unknown> };
    }
  } catch {
    link = null;
  }
  if (!link || sheetQueueState(queue, userId, link.clientRequestId) === 'gone') {
    writeSheetLink(session, userId, hotelId, null);
    return null;
  }
  return link;
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
}): Promise<{ synced: string[]; failed: number; lastError: string | null }> {
  const result = { synced: [] as string[], failed: 0, lastError: null as string | null };
  if (options.isOnline && !options.isOnline()) return { ...result, lastError: LEDGER_NETWORK_ERROR };
  if (options.resetStale !== false) resetStaleSyncingLedgerEntries(options.storage, options.userId);
  const skip = new Set(options.skipIds || []);
  for (const item of pendingLedgerEntries(options.storage, options.userId)) {
    if (skip.has(item.clientRequestId)) continue;
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

export type SheetSourceGone = { kind: 'unchanged' | 'edited'; oldAmount: number; newAmount: string };

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
}): SheetSourceGone | null {
  if (!input.link) return null;
  if (sheetQueueState(input.storage, input.userId, input.link.clientRequestId) !== 'gone') return null;
  const newAmount = String(input.formValues.amount ?? '').trim();
  const unchanged = !newAmount || sameLedgerRetryPayload(input.link.values, input.formValues, { outletId: input.outletId, hotelId: input.hotelId });
  return { kind: unchanged ? 'unchanged' : 'edited', oldAmount: Number(input.link.values.amount || 0), newAmount };
}
