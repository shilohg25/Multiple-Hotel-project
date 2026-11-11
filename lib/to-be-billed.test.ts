import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { outstandingToBeBilled } from './to-be-billed.ts';

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
});
