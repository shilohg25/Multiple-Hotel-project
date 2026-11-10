import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paymentReceiptDate, reservationStatusAfterConfirm } from './payment-confirm.ts';

describe('reservationStatusAfterConfirm', () => {
  it('secures a tentative stay once the down payment is met', () => {
    assert.equal(reservationStatusAfterConfirm('tentative', 1000, 1000), 'secured');
    assert.equal(reservationStatusAfterConfirm('payment_submitted', 1500, 1000), 'secured');
  });

  it('does not change status before the down payment is met', () => {
    assert.equal(reservationStatusAfterConfirm('tentative', 400, 1000), null);
  });

  it('does not downgrade checked-in or checked-out stays', () => {
    assert.equal(reservationStatusAfterConfirm('checked_in', 5000, 1000), null);
    assert.equal(reservationStatusAfterConfirm('checked_out', 5000, 1000), null);
  });

  it('does not bring a cancelled or no-show stay back to secured', () => {
    assert.equal(reservationStatusAfterConfirm('cancelled', 5000, 1000), null);
    assert.equal(reservationStatusAfterConfirm('no_show', 5000, 1000), null);
  });

  it('rejects a received date after the hotel today', () => {
    assert.equal(paymentReceiptDate('2026-11-11', '2026-11-10').ok, false);
    assert.deepEqual(paymentReceiptDate('2026-11-10', '2026-11-10'), { ok: true, date: '2026-11-10' });
    assert.deepEqual(paymentReceiptDate('2026-11-08', '2026-11-10'), { ok: true, date: '2026-11-08' });
    assert.deepEqual(paymentReceiptDate(null, '2026-11-10'), { ok: true, date: '2026-11-10' });
  });
});
