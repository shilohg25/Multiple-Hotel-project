import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roomStatus, stayOnDate, staysOnDate, type StaySlice } from './today-board.ts';

const stay = (patch: Partial<StaySlice>): StaySlice => ({
  id: '1',
  room_id: 'r',
  status: 'secured',
  check_in: '2026-11-10',
  check_out: '2026-11-12',
  guest_name: 'TEST- Guest',
  ...patch
});

describe('today room status', () => {
  it('shows an arrival, an in-house guest, and a departure', () => {
    assert.equal(roomStatus([stay({ status: 'secured' })], '2026-11-10').status, 'arrival');
    assert.equal(roomStatus([stay({ status: 'checked_in', check_in: '2026-11-09' })], '2026-11-10').status, 'in_house');
    assert.equal(roomStatus([stay({ status: 'checked_in', check_out: '2026-11-10' })], '2026-11-10').status, 'departure');
  });

  it('ignores cancelled stays', () => {
    assert.equal(roomStatus([stay({ status: 'cancelled' })], '2026-11-10').status, 'vacant');
  });

  it('shows a still-checked-in guest after checkout as overdue, not vacant', () => {
    const overdue = stay({ id: 'overdue', status: 'checked_in', check_in: '2026-11-09', check_out: '2026-11-11' });
    assert.equal(stayOnDate(overdue, '2026-11-12'), 'overdue');
    const result = roomStatus([overdue], '2026-11-12');
    assert.equal(result.status, 'overdue');
    assert.equal(result.stay?.id, 'overdue');
  });

  it('keeps checkout day as a departure, not overdue', () => {
    assert.equal(stayOnDate(stay({ status: 'checked_in', check_out: '2026-11-12' }), '2026-11-12'), 'departure');
    assert.equal(roomStatus([stay({ status: 'checked_in', check_out: '2026-11-12' })], '2026-11-12').status, 'departure');
  });

  it('does not treat a past checked-out stay as overdue', () => {
    assert.equal(stayOnDate(stay({ status: 'checked_out', check_in: '2026-11-09', check_out: '2026-11-11' }), '2026-11-12'), null);
    assert.equal(roomStatus([stay({ status: 'checked_out', check_in: '2026-11-09', check_out: '2026-11-11' })], '2026-11-12').status, 'vacant');
  });

  it('keeps an overdue room occupied even when another stay arrives that day', () => {
    const overdue = stay({ id: 'overdue', status: 'checked_in', check_in: '2026-11-09', check_out: '2026-11-11' });
    const arrival = stay({ id: 'arrival', status: 'secured', check_in: '2026-11-12', check_out: '2026-11-14' });
    const result = roomStatus([arrival, overdue], '2026-11-12');
    assert.equal(result.status, 'overdue');
    assert.equal(result.stay?.id, 'overdue');
  });

  it('still lists the arriving guest when the room tile is overdue', () => {
    const overdue = stay({ id: 'overdue', status: 'checked_in', check_in: '2026-11-09', check_out: '2026-11-11', guest_name: 'TEST- Overdue' });
    const arrival = stay({ id: 'arrival', status: 'secured', check_in: '2026-11-12', check_out: '2026-11-14', guest_name: 'TEST- Arrival' });
    const listed = staysOnDate([arrival, overdue], '2026-11-12');
    assert.deepEqual(
      listed.map((item) => [item.status, item.stay.id]).sort(),
      [['arrival', 'arrival'], ['overdue', 'overdue']]
    );
    assert.equal(roomStatus([arrival, overdue], '2026-11-12').stay?.id, 'overdue');
  });
});
