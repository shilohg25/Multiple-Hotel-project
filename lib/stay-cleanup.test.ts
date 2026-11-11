import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expectedCashFromLedger } from './expected-cash.ts';
import { figuresFromLedger, summarizeClose } from './day-close.ts';
import { confirmedPaymentLedgerRow } from './confirmed-payment-ledger.ts';
import { balanceDueLabel, interpretStayCleanup } from './stay-cleanup.ts';
import { walkInDeskStay } from './public-quote.ts';

describe('confirmed desk cash', () => {
  it('appears once in day-close expected cash', () => {
    const row = confirmedPaymentLedgerRow({
      hotelId: 'hotel',
      reservationId: 'stay',
      paymentId: 'pay-1',
      amount: 2500,
      method: 'cash',
      guestName: 'Ada',
      entryDate: '2026-11-10',
      actorId: 'staff'
    });
    assert.equal(expectedCashFromLedger([row]), 2500);
    const figures = figuresFromLedger([row], 0);
    const close = summarizeClose({
      ...figures,
      floatCounted: 0,
      drawerCounted: 0,
      bankDeposit: 0
    });
    assert.equal(figures.cashSales, 2500);
    assert.equal(close.expectedCash, 2500);
    assert.notEqual(expectedCashFromLedger([row]) + 2500, 2500);
  });
});

describe('stay cleanup', () => {
  it('does not say the room is free when cancelling also fails', () => {
    const stuck = interpretStayCleanup({
      reservationDeleteFailed: true,
      reservationCancelFailed: true,
      guestDeleteFailed: true,
      ledgerDeleteFailed: false
    });
    assert.equal(stuck.roomHeld, true);
    assert.equal(stuck.message.includes('still held'), true);
    assert.equal(stuck.message.includes('not held'), false);
  });

  it('says the room is free when the stay is cancelled and only the guest delete fails', () => {
    const freed = interpretStayCleanup({
      reservationDeleteFailed: true,
      reservationCancelFailed: false,
      guestDeleteFailed: true,
      ledgerDeleteFailed: true
    });
    assert.equal(freed.roomHeld, false);
    assert.equal(freed.message.includes('not held'), true);
    assert.equal(freed.message.includes('guest record'), true);
    assert.equal(freed.message.includes('cash record'), true);
  });
});

describe('refund due', () => {
  it('names a refund when the paid amount is above the new total', () => {
    const due = balanceDueLabel(1000 - 1775);
    assert.equal(due.label, 'Refund due');
    assert.equal(due.amount, 775);
    assert.equal(balanceDueLabel(0).label, 'Balance due');
  });
});

describe('staff payment cap', () => {
  it('refuses desk cash above the stay total', () => {
    const over = walkInDeskStay({
      bookingSource: 'walk_in',
      deskPayment: 6000,
      downpaymentRequired: 2500,
      stayTotal: 5000
    });
    assert.equal(over.ok, false);
  });
});
