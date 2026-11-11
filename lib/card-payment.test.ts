import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { guestCardCharge } from './card-fees.ts';
import { cardTotalMatches, storedCardAmount } from './card-payment.ts';

describe('card payment total', () => {
  it('records 2317.50 before a 3% surcharge as 2387.03', () => {
    assert.equal(guestCardCharge(2317.5, 3), 2387.03);
    assert.equal(cardTotalMatches(2317.5, 3, 2387.03), true);
    assert.equal(cardTotalMatches(2317.5, 3, 2317.5), false);
  });

  it('treats an old draft with no base amount as the amount before the surcharge', () => {
    const stored = storedCardAmount({ amount: 2250, baseAmount: null, surchargePercent: 3 });
    assert.equal(stored.ok, true);
    if (stored.ok) {
      assert.equal(stored.amount, 2317.5);
      assert.match(stored.notice || '', /before the 3% surcharge/);
    }
  });
});
