import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BILLING_REFERENCE_CORRECTED, billLaterMarkerChangeBlocked, billingReferenceAudit, billingReferenceEdit, outstandingToBeBilled, toBeBilledForCheckIns } from './to-be-billed.ts';

const stay = {
  id: 'stay-1',
  guestName: 'Ada',
  hotelName: 'Navarro',
  checkIn: '2026-11-01',
  checkOut: '2026-11-03',
  source: 'company',
  modeOfPayment: 'to_be_billed:PO-9',
  status: 'secured',
  total: 5000,
  received: 0,
  openedOn: '2026-11-01'
};

describe('outstanding to be billed', () => {
  it('lists an unpaid company or LGU stay with its reference, amount, and age', () => {
    const result = outstandingToBeBilled('2026-11-11', [
      stay,
      { ...stay, id: 'lgu', guestName: 'Ben', source: 'lgu', modeOfPayment: 'to_be_billed:LGU-44', total: 3000, received: 1000, openedOn: '2026-11-08' }
    ]);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].reference, 'PO-9');
    assert.equal(result.rows[0].amountOwed, 5000);
    assert.equal(result.rows[0].ageDays, 10);
    assert.equal(result.rows[1].amountOwed, 2000);
    assert.equal(result.total, 7000);
  });

  it('drops a stay once payments cover the total', () => {
    const result = outstandingToBeBilled('2026-11-11', [
      { ...stay, received: 5000 },
      { ...stay, id: 'over', received: 5100 }
    ]);
    assert.equal(result.rows.length, 0);
    assert.equal(result.total, 0);
  });

  it('ignores cancelled stays and stays that are not to be billed', () => {
    const result = outstandingToBeBilled('2026-11-11', [
      { ...stay, status: 'cancelled' },
      { ...stay, id: 'walk', modeOfPayment: null, source: 'walk_in' }
    ]);
    assert.equal(result.rows.length, 0);
  });

  it('keeps an LGU or company stay when the billing marker was cleared', () => {
    const result = outstandingToBeBilled('2026-11-11', [
      { ...stay, modeOfPayment: null }
    ]);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].source, 'company');
    assert.equal(result.rows[0].reference, '');
    assert.equal(result.rows[0].amountOwed, 5000);
  });

  it('limits a monthly total to check-ins in that month', () => {
    const open = outstandingToBeBilled('2026-11-11', [
      stay,
      { ...stay, id: 'later', checkIn: '2026-12-02', openedOn: '2026-11-02' }
    ]);
    const month = toBeBilledForCheckIns(open.rows, '2026-11-01', '2026-11-30');
    assert.equal(month.rows.length, 1);
    assert.equal(month.total, 5000);
  });

  it('blocks clearing the marker while money is owed, and allows a reference correction', () => {
    assert.equal(billLaterMarkerChangeBlocked({
      currentMode: 'to_be_billed:PO-9',
      nextMode: '',
      amountOwed: 500
    }), true);
    assert.equal(billLaterMarkerChangeBlocked({
      currentMode: 'to_be_billed:PO-9',
      nextMode: 'to_be_billed:PO-10',
      amountOwed: 500
    }), false);
    assert.deepEqual(billingReferenceEdit('to_be_billed:PO-9', 'to_be_billed:PO-10'), {
      kind: 'reference',
      before: 'PO-9',
      after: 'PO-10',
      mode: 'to_be_billed:PO-10'
    });
    const audit = billingReferenceAudit({
      hotelId: 'hotel',
      reservationId: 'stay',
      actorId: 'manager-1',
      before: 'PO-9',
      after: 'PO-10',
      when: '2026-11-11T02:00:00.000Z'
    });
    assert.equal(audit.action, BILLING_REFERENCE_CORRECTED);
    assert.equal(audit.actor_id, 'manager-1');
    assert.equal(audit.details.approved_by, 'manager-1');
    assert.equal(audit.details.approved_at, '2026-11-11T02:00:00.000Z');
    assert.equal(audit.details.before, 'PO-9');
    assert.equal(audit.details.after, 'PO-10');
    assert.equal(billLaterMarkerChangeBlocked({
      currentMode: 'to_be_billed:PO-9',
      nextMode: '',
      amountOwed: 0
    }), false);
  });
});
