import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHARGE_AMOUNT_ERROR, chargeAmountRefusal, isPositiveChargeAmount } from './charge-amount.ts';

describe('charge amount validation', () => {
  it('refuses an empty, zero, or negative amount', () => {
    for (const value of [0, 0.0, '0', '0.00', '0.0', '', '   ', null, undefined, -1, '-10', Number.NaN, 'abc']) {
      assert.equal(isPositiveChargeAmount(value), false, String(value));
      assert.equal(chargeAmountRefusal(value), CHARGE_AMOUNT_ERROR);
    }
  });

  it('accepts a charge amount greater than zero', () => {
    for (const value of [0.01, '0.01', 1, 350, '350.00', 2250]) {
      assert.equal(isPositiveChargeAmount(value), true, String(value));
      assert.equal(chargeAmountRefusal(value), null);
    }
  });

  it('uses a clear staff-facing message', () => {
    assert.match(CHARGE_AMOUNT_ERROR, /₱0\.00/);
    assert.match(CHARGE_AMOUNT_ERROR, /greater than/i);
  });
});
