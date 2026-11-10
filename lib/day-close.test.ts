import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countTotal, figuresFromLedger, summarizeClose } from './day-close.ts';

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

  it('counts the cash-to-deposit box and the bank deposit once', () => {
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
      drawerCounted: 1991,
      bankDeposit: 1991,
      returnToFund: 1959
    });
    assert.equal(summary.status, 'balanced');
    assert.equal(summary.variance, 0);
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
});
