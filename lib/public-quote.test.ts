import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldReleaseHoldOnReject } from './payment-reject.ts';
import {
  guestCountAllowed,
  isPastCheckIn,
  paymentCoversDownpayment,
  paymentWithinStay,
  publicFormHold,
  quotePublicStay,
  staffBookingPayment,
  stayNights,
  walkInDeskStay
} from './public-quote.ts';

describe('public stay quote', () => {
  it('recomputes the stay from nights, not from a client total', () => {
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
    assert.equal(quote.breakfastTotal, 0);
    assert.equal(quote.extraBedTotal, 0);
    assert.equal(quote.total, 5000);
    assert.equal(quote.downpaymentRequired, 2500);
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

    const short = publicFormHold({
      datesReady: true,
      checkIn: '2026-11-10',
      today: '2026-11-10',
      guestCount: 2,
      capacity: 2,
      nights: 1,
      paidText: '100',
      stayTotal: 5000,
      downpaymentRequired: 2500,
      proofSelected: false
    });
    assert.equal(short.paymentTooLow, true);
    assert.equal(short.missingProof, true);
    assert.equal(short.submitDisabled, true);
  });

  it('lets a paid walk-in hold a room and refuses a pencil booking', () => {
    assert.deepEqual(walkInDeskStay({ bookingSource: 'walk_in', deskPayment: 2500, downpaymentRequired: 2500 }), { ok: true, status: 'secured' });
    assert.equal(walkInDeskStay({ bookingSource: 'walk_in', deskPayment: 100, downpaymentRequired: 2500 }).ok, false);
    assert.equal(walkInDeskStay({ bookingSource: 'facebook', deskPayment: 2500, downpaymentRequired: 2500 }).ok, false);
  });

  it('requires a covering payment for OTA, LGU, and company stays, and a reject frees the room', () => {
    const stay = { downpaymentRequired: 2500, stayTotal: 5000 };
    for (const source of ['agoda', 'booking_dot_com', 'expedia', 'trip_dot_com', 'lgu', 'company']) {
      const kind = source === 'lgu' || source === 'company' ? 'invoice' : 'ota_prepaid';
      const named = { bookingSource: source, ...stay, paymentKind: kind, reference: 'REF-1', otaName: source, canConfirm: false };
      assert.equal(staffBookingPayment({ ...named, amount: 0 }).ok, false);
      assert.equal(staffBookingPayment({ ...named, amount: 1000 }).ok, false);
      const accepted = staffBookingPayment({ ...named, amount: 2500 });
      assert.equal(accepted.ok, true);
      if (accepted.ok) {
        assert.equal(accepted.reservationStatus, 'payment_submitted');
        assert.equal(accepted.paymentStatus, 'submitted');
        assert.equal(shouldReleaseHoldOnReject({
          reservationStatus: accepted.reservationStatus,
          otherPaymentStatuses: []
        }), true);
      }
      assert.equal(staffBookingPayment({ ...named, amount: 5001 }).ok, false);
      const manager = staffBookingPayment({ ...named, amount: 2500, canConfirm: true });
      assert.equal(manager.ok && manager.reservationStatus, 'secured');
    }
  });

  it('bills a Tagosilangan extra bed once and does not add breakfast again', () => {
    const quote = quotePublicStay({
      hotelSlug: 'tagosilangan',
      nightlyRate: 2500,
      checkIn: '2026-11-10',
      checkOut: '2026-11-11',
      guestCount: 3,
      withBreakfast: true,
      downpaymentType: 'percent',
      defaultPercent: 50,
      defaultAmount: 0
    });
    const folio = quote.roomTotal + quote.extraBedTotal;
    assert.equal(quote.breakfastTotal, 0);
    assert.equal(quote.extraBedTotal, 500);
    assert.equal(folio, quote.total);
    assert.equal(folio, 3000);
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
