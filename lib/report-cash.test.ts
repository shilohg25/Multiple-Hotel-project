import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expectedCashFromLedger } from './expected-cash.ts';
import { legacyCashCountTotal, reportEndingCash, sheetCountedCash } from './report-cash.ts';

// Frozen copy of the report math at f392e0c (lib/report-data.ts).
function oldReport(cashCounts: { denomination: number; quantity: number }[], expectedCash: number) {
  const actualEndingCash = cashCounts.reduce((sum, item) => sum + Number(item.denomination || 0) * Number(item.quantity || 0), 0);
  return { actualEndingCash, variance: actualEndingCash - expectedCash };
}

const ledger = [
  { payment_method: 'cash', is_collectible: false, amount: 3950 },
  { payment_method: 'gcash', is_collectible: false, amount: 1700 },
  { payment_method: 'cash', is_collectible: true, amount: 900 },
  { payment_method: 'cash', is_collectible: false, amount: '650' }
];
const expectedCash = expectedCashFromLedger(ledger); // 4600
const oldCounts = [{ denomination: 1000, quantity: 4 }, { denomination: 500, quantity: 1 }, { denomination: 0.25, quantity: 3 }];

describe('daily report ending cash', () => {
  it('a new day with only a cash sheet count shows that count', () => {
    const result = reportEndingCash({ closes: [{ outlet_id: null, drawer_counted: 2600, bank_deposit: 2000 }], cashCounts: [], expectedCash });
    assert.equal(result.source, 'cash_sheet');
    assert.equal(result.actualEndingCash, 4600);
    // Same variance formula as the old path, given the same counted cash.
    assert.equal(result.variance, oldReport([{ denomination: 4600, quantity: 1 }], expectedCash).variance);
    assert.equal(result.variance, 0);
  });

  it('an old day with only cash_counts shows exactly what the old report showed', () => {
    const result = reportEndingCash({ closes: [], cashCounts: oldCounts, expectedCash });
    const old = oldReport(oldCounts, expectedCash);
    assert.equal(result.source, 'cash_counts');
    assert.equal(result.actualEndingCash, old.actualEndingCash);
    assert.equal(result.variance, old.variance);
  });

  it('a day with both uses the cash sheet count', () => {
    const result = reportEndingCash({ closes: [{ drawer_counted: '3000.50', bank_deposit: '1000' }], cashCounts: oldCounts, expectedCash });
    assert.equal(result.source, 'cash_sheet');
    assert.equal(result.actualEndingCash, 4000.5);
    assert.equal(result.variance, 4000.5 - expectedCash);
  });

  it('a day with neither shows what the old path showed', () => {
    const result = reportEndingCash({ closes: [], cashCounts: [], expectedCash });
    const old = oldReport([], expectedCash);
    assert.equal(result.source, 'none');
    assert.equal(result.actualEndingCash, old.actualEndingCash);
    assert.equal(result.variance, old.variance);
  });

  it('a saved sheet with a zero count is still the sheet count (not the old count)', () => {
    const result = reportEndingCash({ closes: [{ drawer_counted: 0, bank_deposit: 0 }], cashCounts: oldCounts, expectedCash });
    assert.equal(result.source, 'cash_sheet');
    assert.equal(result.actualEndingCash, 0);
    assert.equal(result.variance, -expectedCash);
  });

  it('adds the hotel close and outlet closes for the whole-hotel report, or one outlet when chosen', () => {
    const closes = [{ outlet_id: null, drawer_counted: 1000, bank_deposit: 500 }, { outlet_id: 'cafe', drawer_counted: 300, bank_deposit: 0 }];
    assert.equal(sheetCountedCash(closes), 1800);
    assert.equal(sheetCountedCash(closes, null), 1500);
    assert.equal(sheetCountedCash(closes, 'cafe'), 300);
    assert.equal(sheetCountedCash(closes, 'bar'), null);
  });

  it('keeps the old cash_counts sum unchanged, including coins', () => {
    assert.equal(legacyCashCountTotal(oldCounts), oldReport(oldCounts, 0).actualEndingCash);
    assert.equal(legacyCashCountTotal(oldCounts), 4500.75);
  });
});
