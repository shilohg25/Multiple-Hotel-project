import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideReservationUpdate } from './reservation-policy.ts';

const money = { posted_room_rate: 2500, total_amount: 5000, downpayment_required: 2500 };

describe('decideReservationUpdate', () => {
  it('lets front desk check in and check out', () => {
    const checkIn = decideReservationUpdate({
      role: 'front_desk',
      currentStatus: 'secured',
      currentMoney: money,
      nextStatus: 'checked_in'
    });
    assert.equal(checkIn.ok, true);
    if (checkIn.ok) assert.deepEqual(checkIn.changes, [{ field: 'status', before: 'secured', after: 'checked_in' }]);

    const checkOut = decideReservationUpdate({
      role: 'front_desk',
      currentStatus: 'checked_in',
      currentMoney: money,
      nextStatus: 'checked_out'
    });
    assert.equal(checkOut.ok, true);
  });

  it('blocks front desk from cancelling or editing money', () => {
    const cancel = decideReservationUpdate({
      role: 'front_desk',
      currentStatus: 'secured',
      currentMoney: money,
      nextStatus: 'cancelled'
    });
    assert.equal(cancel.ok, false);

    const rate = decideReservationUpdate({
      role: 'front_desk',
      currentStatus: 'secured',
      currentMoney: money,
      nextMoney: { posted_room_rate: 1700 }
    });
    assert.equal(rate.ok, false);
    if (!rate.ok) assert.equal(rate.status, 403);
  });

  it('requires a reason and records before and after for a manager', () => {
    const missing = decideReservationUpdate({
      role: 'manager',
      currentStatus: 'secured',
      currentMoney: money,
      nextMoney: { total_amount: 4500 }
    });
    assert.equal(missing.ok, false);

    const saved = decideReservationUpdate({
      role: 'manager',
      currentStatus: 'secured',
      currentMoney: money,
      nextStatus: 'cancelled',
      nextMoney: { posted_room_rate: 2250, total_amount: 4500 },
      reason: 'OTA rate correction'
    });
    assert.equal(saved.ok, true);
    if (saved.ok) {
      assert.deepEqual(saved.changes, [
        { field: 'status', before: 'secured', after: 'cancelled' },
        { field: 'posted_room_rate', before: 2500, after: 2250 },
        { field: 'total_amount', before: 5000, after: 4500 }
      ]);
    }
  });
});
