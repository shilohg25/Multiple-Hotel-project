import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { breakfastBill } from './breakfast-charge.ts';

describe('breakfast bill', () => {
  it('charges 500 per room per night and 250 for each head past two', () => {
    const bill = breakfastBill({ nights: 2, guestCount: 3, outletPerHead: 250 });
    assert.equal(bill.guestTotal, 1500);
    assert.equal(bill.outletOwed, 1500);
    assert.equal(breakfastBill({ nights: 2, guestCount: 1, outletPerHead: 250 }).guestTotal, 1000);
  });
});
