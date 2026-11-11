import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cardSettlementNet, guestCardCharge } from './card-fees.ts';

describe('card fees', () => {
  it('adds the 3% surcharge the guest pays', () => {
    assert.equal(guestCardCharge(1700, 3), 1751);
    assert.equal(guestCardCharge(2250, 3), 2317.5);
  });

  it('estimates the bank net from the guest charge and the MDR', () => {
    assert.equal(cardSettlementNet(2317.5, 3.5), 2236.39);
  });
});