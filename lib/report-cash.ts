/**
 * Daily report "Actual ending cash" and "Cash variance".
 *
 * Variance keeps main's formula: actual ending cash - expected cash. Expected cash is not touched here.
 * Which count is used (Lead's cutover rule, 2026-11-26):
 * 1. The day has cash_counts rows: use them exactly as main did (same sum, same figures, same text).
 * 2. Otherwise, saved Daily cash sheets (day_closes) created at or after CASH_SHEET_CUTOVER:
 *    counted cash = float counted + cash still in the drawer + bank deposit - RVF float,
 *    so a balanced close shows the same cash the close expected, however the bills were split
 *    between the float box and the drawer box. Closes saved before the cutover are ignored,
 *    so days closed under the old screens keep main's figures.
 * 3. Otherwise 0, as main showed.
 */

/**
 * When the Daily cash sheet went live: the planned PR #35 merge, 2026-11-26 1:30 PM MST (20:30 UTC).
 * Closes saved before this keep main's report figures.
 */
export const CASH_SHEET_CUTOVER = '2026-11-26T20:30:00.000Z';

export type ReportCloseRow = {
  outlet_id?: string | null;
  created_at?: string | null;
  rvf_float?: number | string | null;
  float_counted?: number | string | null;
  drawer_counted?: number | string | null;
  bank_deposit?: number | string | null;
};

export type ReportCashCountRow = {
  denomination?: number | string | null;
  quantity?: number | string | null;
};

export type EndingCashSource = 'cash_sheet' | 'cash_counts' | 'none';

function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** Main's report sum, unchanged. */
export function legacyCashCountTotal(rows: ReportCashCountRow[]): number {
  return rows.reduce((sum, item) => sum + Number(item.denomination || 0) * Number(item.quantity || 0), 0);
}

/** True when the close was saved on the Daily cash sheet (at or after the cutover). */
export function isSheetClose(row: ReportCloseRow, cutover: string = CASH_SHEET_CUTOVER): boolean {
  const created = Date.parse(String(row.created_at || ''));
  const start = Date.parse(cutover);
  return Number.isFinite(created) && Number.isFinite(start) && created >= start;
}

/** Cash one sheet close counted beyond the float: float + drawer + deposit - RVF float. */
export function sheetCloseCountedCash(row: ReportCloseRow): number {
  return money(Number(row.float_counted || 0) + Number(row.drawer_counted || 0) + Number(row.bank_deposit || 0) - Number(row.rvf_float || 0));
}

/** Counted cash from sheet closes after the cutover, or null when there are none. */
export function sheetCountedCash(closes: ReportCloseRow[], options: { outletId?: string | null; cutover?: string } = {}): number | null {
  const scoped = closes
    .filter((row) => options.outletId === undefined || (row.outlet_id || null) === (options.outletId || null))
    .filter((row) => isSheetClose(row, options.cutover));
  if (!scoped.length) return null;
  return money(scoped.reduce((sum, row) => sum + sheetCloseCountedCash(row), 0));
}

export function reportEndingCash(input: {
  closes: ReportCloseRow[];
  cashCounts: ReportCashCountRow[];
  expectedCash: number;
  outletId?: string | null;
  cutover?: string;
}): { actualEndingCash: number; variance: number; source: EndingCashSource } {
  if (input.cashCounts.length) {
    const actualEndingCash = legacyCashCountTotal(input.cashCounts);
    return { actualEndingCash, variance: actualEndingCash - input.expectedCash, source: 'cash_counts' };
  }
  const sheet = sheetCountedCash(input.closes, { outletId: input.outletId, cutover: input.cutover });
  if (sheet !== null) {
    return { actualEndingCash: sheet, variance: sheet - input.expectedCash, source: 'cash_sheet' };
  }
  const actualEndingCash = legacyCashCountTotal([]);
  return { actualEndingCash, variance: actualEndingCash - input.expectedCash, source: 'none' };
}

/** Extra line shown only on Daily cash sheet days. Other days show exactly what main showed. */
export function endingCashSourceLabel(source: EndingCashSource): string | null {
  if (source === 'cash_sheet') return 'Actual ending cash is from the Daily cash sheet: float + drawer + bank deposit, minus the RVF float.';
  return null;
}
