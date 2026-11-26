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
import { saveLedgerEntryWithQueue, type LedgerQueueItem, type PostLedgerResult, type StorageLike } from './ledger-entry-queue.ts';

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
