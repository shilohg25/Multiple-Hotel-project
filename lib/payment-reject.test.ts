import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldReleaseHoldOnReject } from './payment-reject.ts';

describe('shouldReleaseHoldOnReject', () => {
  it('cancels a submitted stay when every other proof is already rejected', () => {
    assert.equal(shouldReleaseHoldOnReject({
      reservationStatus: 'payment_submitted',
      otherPaymentStatuses: ['rejected']
    }), true);
    assert.equal(shouldReleaseHoldOnReject({
      reservationStatus: 'payment_submitted',
      otherPaymentStatuses: []
    }), true);
  });

  it('keeps the stay when another proof is still submitted or already confirmed', () => {
    assert.equal(shouldReleaseHoldOnReject({
      reservationStatus: 'payment_submitted',
      otherPaymentStatuses: ['submitted']
    }), false);
    assert.equal(shouldReleaseHoldOnReject({
      reservationStatus: 'payment_submitted',
      otherPaymentStatuses: ['confirmed']
    }), false);
    assert.equal(shouldReleaseHoldOnReject({
      reservationStatus: 'payment_submitted',
      otherPaymentStatuses: ['rejected', 'confirmed']
    }), false);
  });

  it('does not cancel a stay that is no longer waiting on a proof', () => {
    assert.equal(shouldReleaseHoldOnReject({
      reservationStatus: 'secured',
      otherPaymentStatuses: []
    }), false);
  });
});
