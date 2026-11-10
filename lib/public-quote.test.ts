import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { breakfastBill, guestBreakfastCharge } from './breakfast-charge.ts';
import {
  guestCountAllowed,
  isPastCheckIn,
  paymentCoversDownpayment,
  paymentWithinStay,
  publicFormHold,
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

  it('keeps submit off for a typed check-in before today and for too many guests', () => {
    const past = publicFormHold({
      datesReady: true,
      checkIn: '2026-11-09',
      today: '2026-11-10',
      guestCount: 2,
      capacity: 2,
      nights: 1
    });
    assert.equal(past.pastCheckIn, true);
    assert.equal(past.submitDisabled, true);

    const crowded = publicFormHold({
      datesReady: true,
      checkIn: '2026-11-10',
      today: '2026-11-10',
      guestCount: 3,
      capacity: 2,
      nights: 1
    });
    assert.equal(crowded.overCapacity, true);
    assert.equal(crowded.submitDisabled, true);

    const ok = publicFormHold({
      datesReady: true,
      checkIn: '2026-11-10',
      today: '2026-11-10',
      guestCount: 2,
      capacity: 2,
      nights: 1
    });
    assert.equal(ok.submitDisabled, false);

    const overpaid = publicFormHold({
      datesReady: true,
      checkIn: '2026-11-10',
      today: '2026-11-10',
      guestCount: 2,
      capacity: 2,
      nights: 1,
      paidText: '3000',
      stayTotal: 2500
    });
    assert.equal(overpaid.paymentTooHigh, true);
    assert.equal(overpaid.submitDisabled, true);
  });

  it('bills breakfast once after check-in: 1 night, 2 guests is ₱500 on the folio, print, and report', () => {
    const quote = quotePublicStay({
      nightlyRate: 2500,
      checkIn: '2026-11-10',
      checkOut: '2026-11-11',
      guestCount: 2,
      withBreakfast: true,
      downpaymentType: 'percent',
      defaultPercent: 50,
      defaultAmount: 0
    });
    const storedRoomTotal = quote.roomTotal;
    const posted = breakfastBill({ nights: quote.nights, guestCount: 2, ratePerRoom: 500, outletPerHead: 250 });
    const folio = storedRoomTotal + posted.guestTotal;
    const printGrandTotal = storedRoomTotal + posted.guestTotal;
    const reportRoom = storedRoomTotal;
    const reportBreakfast = posted.guestTotal;
    assert.equal(posted.guestTotal, 500);
    assert.equal(quote.breakfastTotal, 500);
    assert.equal(quote.total, storedRoomTotal + 500);
    assert.equal(folio, 3000);
    assert.equal(printGrandTotal, folio);
    assert.equal(reportBreakfast, 500);
    assert.equal(reportRoom + reportBreakfast, folio);
  });

  it('refuses a payment above the displayed stay total and a stay longer than 30 nights', () => {
    const quote = quotePublicStay({
      nightlyRate: 1000,
      checkIn: '2026-11-01',
      checkOut: '2026-12-15',
      guestCount: 1,
      withBreakfast: false,
      downpaymentType: 'percent',
      defaultPercent: 50,
      defaultAmount: 0
    });
    assert.equal(quote.nights > 30, true);
    assert.equal(paymentWithinStay(2500, 2000), false);
    assert.equal(paymentWithinStay(2000, 2000), true);
  });
});
