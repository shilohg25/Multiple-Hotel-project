import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHARGE_AMOUNT_ERROR,
  chargeAmountErrorVisible,
  chargeAmountRefusal,
  isPositiveChargeAmount
} from './charge-amount.ts';

describe('charge amount validation', () => {
  it('refuses an empty, zero, or negative amount', () => {
    for (const value of [0, 0.0, '0', '0.00', '0.0', '', '   ', null, undefined, -1, '-10', Number.NaN, 'abc']) {
      assert.equal(isPositiveChargeAmount(value), false, String(value));
      assert.equal(chargeAmountRefusal(value), CHARGE_AMOUNT_ERROR);
    }
  });

  it('refuses an amount that rounds to ₱0.00 at 2 decimals', () => {
    for (const value of [0.001, 0.004, '0.001', '0.0049', -0.001, -0.004]) {
      assert.equal(isPositiveChargeAmount(value), false, String(value));
      assert.equal(chargeAmountRefusal(value), CHARGE_AMOUNT_ERROR);
    }
  });

  it('accepts a charge amount that is at least ₱0.01 after rounding', () => {
    for (const value of [0.005, '0.005', 0.01, '0.01', 0.014, 1, 350, '350.00', 2250]) {
      assert.equal(isPositiveChargeAmount(value), true, String(value));
      assert.equal(chargeAmountRefusal(value), null);
    }
  });

  it('hides the inline error until the field is used or the form is submitted', () => {
    assert.equal(chargeAmountErrorVisible(false, 0), false);
    assert.equal(chargeAmountErrorVisible(false, '0.00'), false);
    assert.equal(chargeAmountErrorVisible(false, 0.001), false);
    assert.equal(chargeAmountErrorVisible(true, 0), true);
    assert.equal(chargeAmountErrorVisible(true, 0.001), true);
    assert.equal(chargeAmountErrorVisible(true, 350), false);
    assert.equal(chargeAmountErrorVisible(false, 350), false);
  });

  it('uses a clear staff-facing message', () => {
    assert.match(CHARGE_AMOUNT_ERROR, /₱0\.00/);
    assert.match(CHARGE_AMOUNT_ERROR, /greater than/i);
  });
});
