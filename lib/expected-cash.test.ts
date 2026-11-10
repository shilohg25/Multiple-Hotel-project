import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expectedCashFromLedger } from './expected-cash.ts';

describe('expectedCashFromLedger', () => {
  it('counts a confirmed cash room payment once', () => {
    const entries = [
      { payment_method: 'cash', is_collectible: false, amount: 1700, category: 'room_payment' }
    ];
    const confirmedPayments = 1700;
    assert.equal(expectedCashFromLedger(entries), 1700);
    assert.notEqual(expectedCashFromLedger(entries) + confirmedPayments, 1700);
  });

  it('does not treat card, bank, or collectible rows as expected cash', () => {
    assert.equal(
      expectedCashFromLedger([
        { payment_method: 'card', is_collectible: false, amount: 2317.5, category: 'room_payment' },
        { payment_method: 'bank_transfer', is_collectible: false, amount: 1700, category: 'room_payment' },
        { payment_method: 'cash', is_collectible: true, amount: 4770, category: 'collectible' },
        { payment_method: 'cash', is_collectible: false, amount: 500, category: 'room' }
      ]),
      500
    );
  });
});
