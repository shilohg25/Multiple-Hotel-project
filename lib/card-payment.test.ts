import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { guestCardCharge } from './card-fees.ts';
import { cardTotalMatches } from './card-payment.ts';

describe('card payment total', () => {
  it('records 2317.50 before a 3% surcharge as 2387.03', () => {
    assert.equal(guestCardCharge(2317.5, 3), 2387.03);
    assert.equal(cardTotalMatches(2317.5, 3, 2387.03), true);
    assert.equal(cardTotalMatches(2317.5, 3, 2317.5), false);
  });
});
