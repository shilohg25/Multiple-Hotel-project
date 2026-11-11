import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roomStatus, type StaySlice } from './today-board.ts';

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
});