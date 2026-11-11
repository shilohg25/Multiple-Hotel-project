import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stayFolioView } from './stay-total.ts';
import { amountConfirmed, amountReservedByPayments, confirmFitsStay, submitFitsStay } from './payment-cap.ts';

describe('payment cap', () => {
  it('counts a waiting payment, so a second full payment cannot be submitted', () => {
    const reserved = amountReservedByPayments([
      { amount: 5000, status: 'submitted' },
      { amount: 100, status: 'rejected' }
    ]);
    assert.equal(reserved, 5000);
    assert.equal(submitFitsStay(5000, reserved, 5000).ok, false);
    assert.equal(submitFitsStay(5000, 0, 5000).ok, true);
  });

  it('refuses a confirm that would take the stay over its total', () => {
    const confirmed = amountConfirmed([
      { id: 'paid', amount: 5000, status: 'confirmed' },
      { id: 'waiting', amount: 5000, status: 'submitted' }
    ]);
    const refused = confirmFitsStay(5000, confirmed, 5000);
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.match(refused.error, /not confirmed/);
    assert.equal(confirmFitsStay(5000, 0, 5000).ok, true);
  });

  it('uses the stay total after the extra bed was removed', () => {
    const withBed = stayFolioView({
      hotelSlug: 'navarro-hotel',
      postedRoomRate: 1000,
      roomTotal: 1000,
      nights: 1,
      guestCount: 3,
      withBreakfast: true,
      removed: false,
      charges: []
    });
    const removed = stayFolioView({
      hotelSlug: 'navarro-hotel',
      postedRoomRate: 1000,
      roomTotal: 1000,
      nights: 1,
      guestCount: 3,
      withBreakfast: true,
      removed: true,
      charges: []
    });
    assert.ok(withBed.total > removed.total);
    assert.equal(submitFitsStay(withBed.total, 0, removed.total).ok, true);
    assert.equal(confirmFitsStay(removed.total, 0, withBed.total).ok, false);
  });
});
