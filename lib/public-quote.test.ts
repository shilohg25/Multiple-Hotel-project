import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { confirmedPaymentLedgerRow } from './confirmed-payment-ledger.ts';
import { figuresFromLedger, summarizeClose } from './day-close.ts';
import { expectedCashFromLedger } from './expected-cash.ts';
import { shouldReleaseHoldOnReject } from './payment-reject.ts';
import {
  clampGuestCount,
  guestCountAllowed,
  HOLDING_STATUSES,
  readToBeBilled,
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
    assert.equal(clampGuestCount(3, 2), 2);
    assert.equal(clampGuestCount(1, 4), 1);
  });

  it('quotes an extra bed only when that guest count fits the room', () => {
    const input = {
      hotelSlug: 'navarro-hotel',
      nightlyRate: 2500,
      checkIn: '2026-11-12',
      checkOut: '2026-11-13',
      withBreakfast: true,
      downpaymentType: 'percent',
      defaultPercent: 50,
      defaultAmount: 0
    };
    const capped = quotePublicStay({ ...input, guestCount: clampGuestCount(3, 2) });
    assert.equal(capped.extraBedTotal, 0);
    assert.equal(capped.extraBedLine, 'No extra bed');
    const allowed = quotePublicStay({ ...input, guestCount: clampGuestCount(3, 4) });
    assert.equal(guestCountAllowed(3, 4), true);
    assert.equal(allowed.extraBedTotal, 850);
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

  it('requires a covering payment for Expedia and company stays, and a reject frees the room', () => {
    const stay = { downpaymentRequired: 2500, stayTotal: 5000 };
    for (const source of ['expedia', 'company']) {
      const kind = source === 'company' ? 'invoice' : 'ota_prepaid';
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

  it('records Booking.com, Trip.com, and Agoda as full OTA prepaid with no proof', () => {
    for (const source of ['booking_dot_com', 'trip_dot_com', 'agoda']) {
      const half = staffBookingPayment({
        bookingSource: source,
        amount: 2500,
        downpaymentRequired: 2500,
        stayTotal: 5000,
        paymentKind: 'ota_prepaid',
        reference: 'OTA-1',
        otaName: source,
        canConfirm: false
      });
      assert.equal(half.ok, false);
      const missingReference = staffBookingPayment({
        bookingSource: source,
        amount: 5000,
        downpaymentRequired: 2500,
        stayTotal: 5000,
        paymentKind: 'ota_prepaid',
        reference: '',
        otaName: source,
        canConfirm: true
      });
      assert.equal(missingReference.ok, false);
      const prepaid = staffBookingPayment({
        bookingSource: source,
        amount: 5000,
        downpaymentRequired: 2500,
        stayTotal: 5000,
        paymentKind: 'ota_prepaid',
        reference: 'OTA-1',
        otaName: source,
        canConfirm: false
      });
      assert.equal(prepaid.ok, true);
      if (prepaid.ok) {
        assert.equal(prepaid.reservationStatus, 'secured');
        assert.equal(prepaid.paymentStatus, 'confirmed');
        assert.equal(prepaid.proofPath, 'staff/no-proof');
        assert.equal(prepaid.writeLedger, true);
        assert.equal(prepaid.countsAsDeskCash, false);
        assert.notEqual(prepaid.method, 'cash');
        assert.equal(HOLDING_STATUSES.includes(prepaid.reservationStatus), true);
        if (source === 'booking_dot_com') {
          const row = confirmedPaymentLedgerRow({
            hotelId: 'hotel',
            reservationId: 'stay',
            paymentId: 'pay',
            amount: 5000,
            method: prepaid.method,
            guestName: 'Guest',
            entryDate: '2026-11-11'
          });
          const mixed = figuresFromLedger([
            { category: row.category, payment_method: row.payment_method, is_collectible: row.is_collectible, amount: row.amount },
            { category: 'room_payment', payment_method: 'cash', is_collectible: false, amount: 100 }
          ], 0);
          assert.equal(mixed.cashSales, 100);
          assert.equal(summarizeClose(mixed).expectedCash, 100);
          assert.equal(expectedCashFromLedger([
            { payment_method: String(row.payment_method), is_collectible: false, amount: 5000, category: row.category },
            { payment_method: 'cash', is_collectible: false, amount: 100, category: 'room_payment' }
          ]), 100);
        }
      }
    }
  });

  it('holds an LGU stay with nothing paid and no ledger row', () => {
    const missing = staffBookingPayment({
      bookingSource: 'lgu',
      amount: 0,
      downpaymentRequired: 2500,
      stayTotal: 5000,
      paymentKind: 'invoice',
      reference: '',
      canConfirm: false
    });
    assert.equal(missing.ok, false);
    const billed = staffBookingPayment({
      bookingSource: 'lgu',
      amount: 0,
      downpaymentRequired: 2500,
      stayTotal: 5000,
      paymentKind: 'invoice',
      reference: 'LGU-44',
      canConfirm: false
    });
    assert.equal(billed.ok, true);
    if (billed.ok) {
      assert.equal(billed.reservationStatus, 'secured');
      assert.equal(billed.recordPayment, false);
      assert.equal(billed.writeLedger, false);
      assert.equal(billed.countsAsDeskCash, false);
      assert.equal(billed.modeOfPayment, 'to_be_billed:LGU-44');
      assert.equal(HOLDING_STATUSES.includes(billed.reservationStatus), true);
      assert.equal(readToBeBilled(billed.modeOfPayment)?.reference, 'LGU-44');
    }
    const deposit = staffBookingPayment({
      bookingSource: 'lgu',
      amount: 100,
      downpaymentRequired: 2500,
      stayTotal: 5000,
      paymentKind: 'invoice',
      reference: 'LGU-44',
      canConfirm: true
    });
    assert.equal(deposit.ok, false);
  });

  it('still blocks a direct booking under half the stay', () => {
    const bank = staffBookingPayment({
      bookingSource: 'company',
      amount: 1000,
      downpaymentRequired: 2500,
      stayTotal: 5000,
      paymentKind: 'bank_transfer',
      reference: 'BANK-1',
      canConfirm: true
    });
    assert.equal(bank.ok, false);
    if (!bank.ok) assert.match(bank.error, /half/);
    const direct = staffBookingPayment({
      bookingSource: 'phone',
      amount: 1000,
      downpaymentRequired: 2500,
      stayTotal: 5000,
      paymentKind: 'bank_transfer',
      reference: 'DIR-1',
      canConfirm: true
    });
    assert.equal(direct.ok, false);
    const walkIn = staffBookingPayment({
      bookingSource: 'walk_in',
      amount: 1000,
      downpaymentRequired: 2500,
      stayTotal: 5000,
      paymentKind: 'desk_cash',
      canConfirm: true
    });
    assert.equal(walkIn.ok, false);
    if (!walkIn.ok) assert.match(walkIn.error, /half/);
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
