import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OVERDUE_OPEN_CHECKOUT,
  boardBarRange,
  effectiveCheckOut,
  stayConflictsWithRange,
  stayOccupiesRange
} from './occupancy.ts';

const today = '2026-11-27';

const stay = (patch: { status?: string; check_in?: string; check_out?: string } = {}) => ({
  status: 'checked_in',
  check_in: '2026-11-20',
  check_out: '2026-11-24',
  ...patch
});

describe('effectiveCheckOut', () => {
  it('leaves a scheduled checkout unchanged when the guest is not overdue', () => {
    assert.equal(effectiveCheckOut(stay({ check_out: '2026-11-30' }), today), '2026-11-30');
    assert.equal(effectiveCheckOut(stay({ check_out: today }), today), today);
    assert.equal(effectiveCheckOut(stay({ status: 'secured', check_out: '2026-11-24' }), today), '2026-11-24');
    assert.equal(effectiveCheckOut(stay({ status: 'checked_out', check_out: '2026-11-24' }), today), '2026-11-24');
  });

  it('keeps an overdue checked-in stay occupied through today and later dates until checkout', () => {
    assert.equal(effectiveCheckOut(stay(), today), OVERDUE_OPEN_CHECKOUT);
    assert.ok(effectiveCheckOut(stay(), today) > today);
  });
});

describe('reservations board occupancy', () => {
  it('shows an overdue checked-in stay on a board window that starts after checkout', () => {
    const overdue = stay();
    const from = '2026-11-27';
    const to = '2026-12-04';
    assert.equal(stayOccupiesRange(overdue, from, to, today), true);
    const bar = boardBarRange(overdue.check_in, effectiveCheckOut(overdue, today), from, to);
    assert.deepEqual(bar, { start: 0, length: 7 });
  });

  it('still shows an overdue checked-in stay on a later board window', () => {
    const overdue = stay();
    const from = '2026-12-01';
    const to = '2026-12-08';
    assert.equal(stayOccupiesRange(overdue, from, to, today), true);
    assert.deepEqual(boardBarRange(overdue.check_in, effectiveCheckOut(overdue, today), from, to), { start: 0, length: 7 });
  });

  it('does not show a stay after the guest has checked out', () => {
    const departed = stay({ status: 'checked_out' });
    assert.equal(stayOccupiesRange(departed, '2026-11-27', '2026-12-04', today), false);
    assert.equal(boardBarRange(departed.check_in, effectiveCheckOut(departed, today), '2026-11-27', '2026-12-04'), null);
  });
});

describe('booking conflicts and public availability', () => {
  const overdue = stay();

  it('blocks a new booking on an overdue room for today while the guest is still checked in', () => {
    assert.equal(stayConflictsWithRange(overdue, '2026-11-27', '2026-11-28', today), true);
  });

  it('blocks a new booking on an overdue room for future dates while the guest is still checked in', () => {
    assert.equal(stayConflictsWithRange(overdue, '2026-12-01', '2026-12-03', today), true);
  });

  it('does not conflict after checkout', () => {
    const departed = stay({ status: 'checked_out' });
    assert.equal(stayConflictsWithRange(departed, '2026-11-27', '2026-11-28', today), false);
    assert.equal(stayConflictsWithRange(departed, '2026-12-01', '2026-12-03', today), false);
  });

  it('excludes an overdue room from public availability for today and later dates', () => {
    // Public POST /api/public/bookings uses hasReservationConflict, which applies this rule.
    assert.equal(stayConflictsWithRange(overdue, '2026-11-27', '2026-11-29', today), true);
    assert.equal(stayConflictsWithRange(overdue, '2026-12-10', '2026-12-12', today), true);
  });

  it('still allows a new arrival on a scheduled departure day', () => {
    const departingToday = stay({ check_out: today });
    assert.equal(stayConflictsWithRange(departingToday, today, '2026-11-28', today), false);
  });

  it('does not block dates after a non-overdue checked-in stay\'s scheduled checkout', () => {
    const inHouse = stay({ check_out: '2026-11-30' });
    assert.equal(stayConflictsWithRange(inHouse, '2026-11-30', '2026-12-02', today), false);
    assert.equal(stayConflictsWithRange(inHouse, '2026-11-28', '2026-11-30', today), true);
  });

  it('ignores cancelled and tentative stays for holding conflicts', () => {
    assert.equal(stayConflictsWithRange(stay({ status: 'cancelled' }), today, '2026-11-28', today), false);
    assert.equal(stayConflictsWithRange(stay({ status: 'tentative' }), today, '2026-11-28', today), false);
  });
});
