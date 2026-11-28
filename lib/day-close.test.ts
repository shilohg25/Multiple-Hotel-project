import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { closeFiguresFromCounts, countMapForBucket, countTotal, figuresFromLedger, formNumberValue, hasCashBeenCounted, resolveReturnToFund, shouldShowCloseVariance, summarizeClose } from './day-close.ts';

describe('close the day', () => {
  it('matches the 8 Nov sheet example, including collectables in room sales', () => {
    const figures = figuresFromLedger([
      { category: 'room', payment_method: 'cash', amount: 3950 },
      { category: 'room', payment_method: 'bank_transfer', amount: 1700 },
      { category: 'room', payment_method: 'cash', is_collectible: true, amount: 4770 },
      { category: 'expense', payment_method: 'cash', amount: 1959 }
    ], 10000);
    const summary = summarizeClose({
      ...figures,
      floatCounted: 10000,
      drawerCounted: 0,
      bankDeposit: 1991,
      returnToFund: 1959
    });
    assert.equal(summary.roomSales, 10420);
    assert.equal(summary.expenses, 1959);
    assert.equal(summary.collectibles, 4770);
    assert.equal(summary.bank, 1700);
    assert.equal(summary.cashOnHand, 3950);
    assert.equal(summary.expectedCash, 1991);
    assert.equal(summary.status, 'balanced');
  });

  it('adds cash still in the drawer to money already deposited', () => {
    const summary = summarizeClose({
      roomSales: 10420,
      addonSales: 0,
      miscSales: 0,
      expenses: 1959,
      collectibles: 4770,
      gcash: 0,
      maya: 0,
      bank: 1700,
      card: 0,
      cheque: 0,
      otherNonCash: 0,
      cashSales: 3950,
      rvfFloat: 10000,
      floatCounted: 10000,
      drawerCounted: 991,
      bankDeposit: 1000,
      returnToFund: 1959
    });
    assert.equal(summary.expectedCash, 1991);
    assert.equal(summary.variance, 0);
    assert.equal(summary.status, 'balanced');
  });

  it('does not count a collectible category as cash when the flag was left off', () => {
    const figures = figuresFromLedger([
      { category: 'collectible', payment_method: 'cash', is_collectible: false, amount: 500 }
    ], 10000);
    const summary = summarizeClose(figures);
    assert.equal(summary.collectibles, 500);
    assert.equal(summary.cashSales, 0);
    assert.equal(summary.cashOnHand, 0);
  });

  it('marks a short drawer and keeps the float separate', () => {
    const summary = summarizeClose({
      roomSales: 1000,
      addonSales: 0,
      miscSales: 0,
      expenses: 0,
      collectibles: 0,
      gcash: 0,
      maya: 0,
      bank: 0,
      card: 0,
      cheque: 0,
      otherNonCash: 0,
      cashSales: 1000,
      rvfFloat: 10000,
      floatCounted: countTotal([{ denomination: 1000, quantity: 10 }]),
      drawerCounted: 900,
      bankDeposit: 0,
      returnToFund: 0
    });
    assert.equal(summary.floatCounted, 10000);
    assert.equal(summary.status, 'short');
    assert.equal(summary.variance, -100);
  });

  it('resolves return-to-fund the same way the preview and the server do', () => {
    assert.equal(resolveReturnToFund(undefined, 1959), 1959);
    assert.equal(resolveReturnToFund(null, 1959), 1959);
    assert.equal(resolveReturnToFund(Number.NaN, 1959), 1959);
    assert.equal(resolveReturnToFund(0, 1959), 0);
    assert.equal(resolveReturnToFund(500, 1959), 500);
  });

  it('reloads saved denomination counts into the float and drawer maps', () => {
    const rows = [
      { bucket: 'float', denomination: 1000, quantity: 10 },
      { bucket: 'drawer', denomination: 1000, quantity: 4 },
      { bucket: 'drawer', denomination: 500, quantity: 1 }
    ];
    assert.deepEqual(countMapForBucket(rows, 'float'), { 1000: 10 });
    assert.deepEqual(countMapForBucket(rows, 'drawer'), { 1000: 4, 500: 1 });
    assert.equal(countTotal(Object.entries(countMapForBucket(rows, 'drawer')).map(([denomination, quantity]) => ({ denomination: Number(denomination), quantity }))), 4500);
  });

  it('gives the preview and the server the same close figures from one helper', () => {
    const base = figuresFromLedger([
      { category: 'room', payment_method: 'cash', amount: 3950 },
      { category: 'expense', payment_method: 'cash', amount: 1959 }
    ], 10000);
    const input = {
      floatCounts: [{ denomination: 1000, quantity: 10 }],
      drawerCounts: [{ denomination: 1000, quantity: 2 }],
      bankDeposit: 0,
      returnToFund: 800
    };
    const preview = summarizeClose(closeFiguresFromCounts(base, input));
    const saved = summarizeClose(closeFiguresFromCounts(base, input));
    assert.equal(preview.returnToFund, 800);
    assert.equal(preview.returnToFund, saved.returnToFund);
    assert.equal(preview.expectedCash, saved.expectedCash);
    assert.equal(preview.variance, saved.variance);
    assert.equal(preview.status, saved.status);
    // A leftover expenses default would have been 1959 and would not match the saved 800.
    assert.notEqual(preview.returnToFund, base.expenses);
  });

  it('reloads a saved return-to-fund of 0 as 0, not an empty input', () => {
    assert.equal(resolveReturnToFund(0, 1959), 0);
    assert.equal(formNumberValue(0), 0);
    assert.equal(formNumberValue(800), 800);
    assert.equal(formNumberValue(null), '');
    assert.equal(formNumberValue(undefined), '');
    assert.notEqual(formNumberValue(0), '');
  });

  it('treats an empty sheet as not yet counted, even when the math is already short', () => {
    assert.equal(hasCashBeenCounted({}, {}, 0), false);
    assert.equal(hasCashBeenCounted({ 1000: 0, 500: 0 }, { 1000: 0 }, 0), false);
    assert.equal(hasCashBeenCounted({}, {}, null), false);
    assert.equal(hasCashBeenCounted({}, {}, undefined), false);
    assert.equal(hasCashBeenCounted([{ quantity: 0 }, { quantity: '0' }], [], 0), false);
    const empty = summarizeClose(figuresFromLedger([{ category: 'room', payment_method: 'cash', amount: 2250 }], 10000));
    assert.equal(empty.status, 'short');
    assert.equal(empty.variance, -12250);
    assert.equal(hasCashBeenCounted({}, {}, empty.bankDeposit), false);
  });

  it('treats a float, drawer, or bank deposit entry as counted', () => {
    assert.equal(hasCashBeenCounted({ 1000: 10 }, {}, 0), true);
    assert.equal(hasCashBeenCounted({}, { 1: 1 }, 0), true);
    assert.equal(hasCashBeenCounted({}, {}, 0.01), true);
    assert.equal(hasCashBeenCounted([{ quantity: 2 }], [], 0), true);
    assert.equal(hasCashBeenCounted([], [{ denomination: 100, quantity: '3' }], 0), true);
    // Return-to-fund is not passed in, so editing it cannot flip this flag.
    assert.equal(hasCashBeenCounted({}, {}, 0), false);
  });

  it('ignores invalid or negative quantities when deciding whether a count exists', () => {
    assert.equal(hasCashBeenCounted({ 1000: -1 }, { 500: Number.NaN }, 'not-a-number'), false);
    assert.equal(hasCashBeenCounted({ 1000: -1, 500: 1 }, {}, 0), true);
  });


  it('shows the stored Short on a saved close even when every count is still zero', () => {
    const saved = { id: 'close-1', variance_status: 'short' };
    assert.equal(shouldShowCloseVariance(null, {}, {}, 0), false);
    assert.equal(shouldShowCloseVariance(undefined, {}, {}, 0), false);
    assert.equal(shouldShowCloseVariance(saved, {}, {}, 0), true);
    assert.equal(shouldShowCloseVariance(saved, { 1000: 0 }, { 1000: 0 }, 0), true);
    assert.equal(shouldShowCloseVariance(null, { 1000: 10 }, {}, 0), true);
  });

});
