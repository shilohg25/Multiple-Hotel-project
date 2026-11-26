import { cashOnHandCounted } from './day-close.ts';

/**
 * Daily report "Actual ending cash" and "Cash variance".
 *
 * Same meaning and same variance formula as before (actual ending cash - expected cash).
 * Only the source of the counted cash moved:
 * 1. The Daily cash sheet's saved count (day_closes), when the day has one.
 *    Counted cash = cash still in the drawer + money already deposited (cashOnHandCounted).
 *    The RVF float is not part of it, because expected cash (cash received) has no float either.
 *    The report covers the whole hotel, so every saved close for that date is added
 *    (the hotel close plus any outlet closes), unless an outlet is chosen.
 * 2. Otherwise the older separate cash count (cash_counts), exactly as the report summed it before,
 *    so days counted the old way keep the same history.
 * 3. Neither: 0, as before.
 */

export type ReportCloseRow = {
  outlet_id?: string | null;
  drawer_counted?: number | string | null;
  bank_deposit?: number | string | null;
};

export type ReportCashCountRow = {
  denomination?: number | string | null;
  quantity?: number | string | null;
};

export type EndingCashSource = 'cash_sheet' | 'cash_counts' | 'none';

/** The old report's sum, unchanged. */
export function legacyCashCountTotal(rows: ReportCashCountRow[]): number {
  return rows.reduce((sum, item) => sum + Number(item.denomination || 0) * Number(item.quantity || 0), 0);
}

/** Counted cash from saved cash sheets, or null when the day has no saved sheet. */
export function sheetCountedCash(closes: ReportCloseRow[], outletId?: string | null): number | null {
  const scoped = outletId === undefined ? closes : closes.filter((row) => (row.outlet_id || null) === (outletId || null));
  if (!scoped.length) return null;
  const total = scoped.reduce((sum, row) => sum + cashOnHandCounted(Number(row.drawer_counted || 0), Number(row.bank_deposit || 0)), 0);
  return Math.round(total * 100) / 100;
}

export function reportEndingCash(input: {
  closes: ReportCloseRow[];
  cashCounts: ReportCashCountRow[];
  expectedCash: number;
  outletId?: string | null;
}): { actualEndingCash: number; variance: number; source: EndingCashSource } {
  const sheet = sheetCountedCash(input.closes, input.outletId);
  let actualEndingCash: number;
  let source: EndingCashSource;
  if (sheet !== null) {
    actualEndingCash = sheet;
    source = 'cash_sheet';
  } else if (input.cashCounts.length) {
    actualEndingCash = legacyCashCountTotal(input.cashCounts);
    source = 'cash_counts';
  } else {
    actualEndingCash = legacyCashCountTotal([]);
    source = 'none';
  }
  return { actualEndingCash, variance: actualEndingCash - input.expectedCash, source };
}

export function endingCashSourceLabel(source: EndingCashSource): string {
  if (source === 'cash_sheet') return 'Counted on the Daily cash sheet (cash in the drawer plus bank deposit, without the float).';
  if (source === 'cash_counts') return 'Counted with the older separate cash count.';
  return 'No cash count saved for this day yet.';
}
