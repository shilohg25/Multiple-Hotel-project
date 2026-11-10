import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { guestBreakfastCharge } from './breakfast-charge.ts';
import {
  guestCountAllowed,
  isPastCheckIn,
  paymentCoversDownpayment,
  quotePublicStay,
  stayNights
} from './public-quote.ts';

describe('public stay quote', () => {
  it('recomputes room and breakfast from nights, not from a client total', () => {
    const quote = quotePublicStay({
      nightlyRate: 2500,
      checkIn: '2026-11-10',
      checkOut: '2026-11-12',
      guestCount: 2,
      withBreakfast: true,
      downpaymentType: 'percent',
      defaultPercent: 50,
      defaultAmount: 0
    });
    assert.equal(stayNights('2026-11-10', '2026-11-12'), 2);
    assert.equal(quote.roomTotal, 5000);
    assert.equal(quote.breakfastTotal, 1000);
    assert.equal(quote.total, 6000);
    assert.equal(quote.downpaymentRequired, 3000);
    assert.equal(guestBreakfastCharge(2, 1).guestTotal, 1000);
    assert.equal(guestBreakfastCharge(2, 3).guestTotal, 1500);
  });

  it('uses a flagged 50% minimum when a manual hotel has no amount', () => {
    const quote = quotePublicStay({
      nightlyRate: 2000,
      checkIn: '2026-11-10',
      checkOut: '2026-11-11',
      guestCount: 1,
      withBreakfast: false,
      downpaymentType: 'manual',
      defaultPercent: 0,
      defaultAmount: 0
    });
    assert.equal(quote.total, 2000);
    assert.equal(quote.downpaymentRequired, 1000);
    assert.equal(quote.downpaymentDefaulted, true);
  });

  it('rejects a payment below the required down payment', () => {
    assert.equal(paymentCoversDownpayment(999, 1000), false);
    assert.equal(paymentCoversDownpayment(1000, 1000), true);
  });

  it('rejects a check-in before the hotel today', () => {
    assert.equal(isPastCheckIn('2026-11-09', '2026-11-10'), true);
    assert.equal(isPastCheckIn('2026-11-10', '2026-11-10'), false);
  });

  it('checks guest count against room capacity', () => {
    assert.equal(guestCountAllowed(2, 2), true);
    assert.equal(guestCountAllowed(3, 2), false);
    assert.equal(guestCountAllowed(0, 2), false);
  });
});
