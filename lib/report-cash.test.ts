import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CASH_SHEET_CUTOVER, endingCashSourceLabel, legacyCashCountTotal, reportEndingCash, sheetCountedCash } from './report-cash.ts';

// Frozen copy of main's report math (lib/report-data.ts at 3bcb827).
function mainReport(cashCounts: { denomination: number; quantity: number }[], expectedCash: number) {
  const actualEndingCash = cashCounts.reduce((sum, item) => sum + Number(item.denomination || 0) * Number(item.quantity || 0), 0);
  return { actualEndingCash, variance: actualEndingCash - expectedCash };
}

const CUTOVER = '2026-11-26T22:00:00.000Z';
const BEFORE = '2026-11-09T03:00:00.000Z';
const AFTER = '2026-11-27T01:00:00.000Z';
const close = (fields: { float: number; drawer: number; deposit?: number; created: string; outlet?: string | null; rvf?: number }) => ({
  outlet_id: fields.outlet ?? null,
  created_at: fields.created,
  rvf_float: fields.rvf ?? 10000,
  float_counted: fields.float,
  drawer_counted: fields.drawer,
  bank_deposit: fields.deposit ?? 0
});

describe('daily report ending cash, Tester scenarios (cash-sheet-compare-edf8a60.md)', () => {
  it('8a old day with only cash_counts 880, expected 900: main figures 880 / -20', () => {
    const counts = [{ denomination: 500, quantity: 1 }, { denomination: 100, quantity: 3 }, { denomination: 20, quantity: 4 }];
    const result = reportEndingCash({ closes: [], cashCounts: counts, expectedCash: 900, cutover: CUTOVER });
    assert.deepEqual({ a: result.actualEndingCash, v: result.variance }, { a: 880, v: -20 });
    assert.deepEqual({ a: result.actualEndingCash, v: result.variance }, (({ actualEndingCash: a, variance: v }) => ({ a, v }))(mainReport(counts, 900)));
    assert.equal(endingCashSourceLabel(result.source), null);
  });

  it('8b old day with cash_counts 1,000 and a close (drawer 800), expected 1,200: main figures 1,000 / -200', () => {
    const counts = [{ denomination: 1000, quantity: 1 }];
    for (const created of [BEFORE, AFTER]) {
      const result = reportEndingCash({ closes: [close({ float: 10000, drawer: 800, created })], cashCounts: counts, expectedCash: 1200, cutover: CUTOVER });
      assert.equal(result.actualEndingCash, 1000);
      assert.equal(result.variance, -200);
      assert.equal(result.source, 'cash_counts');
    }
  });

  it('8d day closed under main (close only, drawer 1,000 + deposit 300), expected 1,300: main figures 0 / -1,300', () => {
    const result = reportEndingCash({ closes: [close({ float: 10000, drawer: 1000, deposit: 300, created: BEFORE })], cashCounts: [], expectedCash: 1300, cutover: CUTOVER });
    assert.equal(result.actualEndingCash, 0);
    assert.equal(result.variance, -1300);
    assert.equal(result.source, 'none');
    assert.equal(endingCashSourceLabel(result.source), null);
  });

  it('8c neither: main figures 0 / -700', () => {
    const result = reportEndingCash({ closes: [], cashCounts: [], expectedCash: 700, cutover: CUTOVER });
    assert.deepEqual({ a: result.actualEndingCash, v: result.variance }, { a: 0, v: -700 });
  });

  it('7b balanced sheet close, float 9,500 / drawer 1,700, cash sale 1,200: variance 0', () => {
    const result = reportEndingCash({ closes: [close({ float: 9500, drawer: 1700, created: AFTER })], cashCounts: [], expectedCash: 1200, cutover: CUTOVER });
    assert.equal(result.source, 'cash_sheet');
    assert.equal(result.actualEndingCash, 1200);
    assert.equal(result.variance, 0);
  });

  it('7c balanced sheet close, float 0 / drawer 11,200, cash sale 1,200: variance 0', () => {
    const result = reportEndingCash({ closes: [close({ float: 0, drawer: 11200, created: AFTER })], cashCounts: [], expectedCash: 1200, cutover: CUTOVER });
    assert.equal(result.actualEndingCash, 1200);
    assert.equal(result.variance, 0);
  });

  it('a sheet day uses the same variance formula as main for the same counted cash', () => {
    const result = reportEndingCash({ closes: [close({ float: 10000, drawer: 900, created: AFTER })], cashCounts: [], expectedCash: 1000, cutover: CUTOVER });
    assert.equal(result.variance, mainReport([{ denomination: 900, quantity: 1 }], 1000).variance);
    assert.equal(result.variance, -100);
  });
});

describe('daily report cutover details', () => {
  it('a close saved exactly at the cutover counts as a sheet close', () => {
    assert.equal(sheetCountedCash([close({ float: 10000, drawer: 500, created: CUTOVER })], { cutover: CUTOVER }), 500);
  });

  it('the placeholder cutover keeps every close on main behaviour until it is set', () => {
    assert.ok(CASH_SHEET_CUTOVER.startsWith('9999-'));
    const result = reportEndingCash({ closes: [close({ float: 10000, drawer: 1000, created: AFTER })], cashCounts: [], expectedCash: 1000 });
    assert.deepEqual({ a: result.actualEndingCash, v: result.variance, s: result.source }, { a: 0, v: -1000, s: 'none' });
  });

  it('adds hotel and outlet sheet closes for the whole-hotel report, skips closes before the cutover, or uses one outlet', () => {
    const closes = [
      close({ float: 10000, drawer: 1500, created: AFTER }),
      close({ float: 2000, drawer: 300, created: AFTER, outlet: 'cafe', rvf: 2000 }),
      close({ float: 10000, drawer: 999, created: BEFORE, outlet: 'bar' })
    ];
    assert.equal(sheetCountedCash(closes, { cutover: CUTOVER }), 1800);
    assert.equal(sheetCountedCash(closes, { outletId: null, cutover: CUTOVER }), 1500);
    assert.equal(sheetCountedCash(closes, { outletId: 'cafe', cutover: CUTOVER }), 300);
    assert.equal(sheetCountedCash(closes, { outletId: 'bar', cutover: CUTOVER }), null);
  });

  it('keeps main cash_counts sum unchanged, including coins', () => {
    const counts = [{ denomination: 1000, quantity: 4 }, { denomination: 500, quantity: 1 }, { denomination: 0.25, quantity: 3 }];
    assert.equal(legacyCashCountTotal(counts), mainReport(counts, 0).actualEndingCash);
  });
});
