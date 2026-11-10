import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countTotal, summarizeClose } from './day-close.ts';

describe('close the day', () => {
  it('matches the sheet example of a balanced deposit', () => {
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
    assert.equal(summary.cashOnHand, 3950);
    assert.equal(summary.expectedCash, 1991);
    assert.equal(summary.status, 'balanced');
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
      bankDeposit: 900,
      returnToFund: 0
    });
    assert.equal(summary.floatCounted, 10000);
    assert.equal(summary.status, 'short');
    assert.equal(summary.variance, -100);
  });
});
