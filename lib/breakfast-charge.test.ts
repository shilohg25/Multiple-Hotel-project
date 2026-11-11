import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { breakfastBill } from './breakfast-charge.ts';

describe('breakfast bill', () => {
  it('charges 500 per room per night and 250 per head per night', () => {
    const bill = breakfastBill({ nights: 2, guestCount: 3, ratePerRoom: 500, outletPerHead: 250 });
    assert.equal(bill.guestTotal, 1000);
    assert.equal(bill.outletOwed, 1500);
  });
});
