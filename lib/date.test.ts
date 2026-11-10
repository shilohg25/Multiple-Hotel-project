import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_BUSINESS_TIMEZONE,
  businessMonth,
  businessTimeZone,
  businessToday,
  formatDate,
  localDayBounds,
  localMonthBounds,
  monthRange
} from './date.ts';

const MANILA_MORNING_UTC = new Date('2026-11-09T16:30:00.000Z');

describe('business calendar', () => {
  it('defaults to Asia/Manila and rejects an unknown zone', () => {
    assert.equal(DEFAULT_BUSINESS_TIMEZONE, 'Asia/Manila');
    assert.equal(businessTimeZone(null), 'Asia/Manila');
    assert.equal(businessTimeZone('Not/AZone'), 'Asia/Manila');
    assert.equal(businessTimeZone('Asia/Manila'), 'Asia/Manila');
  });

  it('treats 00:30 in Manila as the next calendar day, not the UTC date', () => {
    assert.equal(MANILA_MORNING_UTC.toISOString().slice(0, 10), '2026-11-09');
    assert.equal(businessToday('Asia/Manila', MANILA_MORNING_UTC), '2026-11-10');
    assert.equal(businessMonth('Asia/Manila', MANILA_MORNING_UTC), '2026-11');
  });

  it('uses the hotel zone when it is not Manila', () => {
    const instant = new Date('2026-11-10T07:30:00.000Z');
    assert.equal(businessToday('Asia/Manila', instant), '2026-11-10');
    assert.equal(businessToday('America/Los_Angeles', instant), '2026-11-09');
  });

  it('bounds a Manila business day from 16:00Z the previous evening through 15:59:59.999Z', () => {
    const bounds = localDayBounds('2026-11-10', 'Asia/Manila');
    assert.equal(bounds.start, '2026-11-09T16:00:00.000Z');
    assert.equal(bounds.end, '2026-11-10T15:59:59.999Z');
    assert.equal(businessToday('Asia/Manila', new Date(bounds.start)), '2026-11-10');
    assert.equal(businessToday('Asia/Manila', new Date(bounds.end)), '2026-11-10');
  });

  it('lists every calendar day of the business month', () => {
    const range = localMonthBounds('2026-11', 'Asia/Manila');
    assert.equal(range.startDate, '2026-11-01');
    assert.equal(range.endDate, '2026-11-30');
    assert.equal(range.days.length, 30);
    assert.equal(range.days[0], '2026-11-01');
    assert.equal(range.days[29], '2026-11-30');
    assert.equal(range.start, '2026-10-31T16:00:00.000Z');
    assert.equal(range.end, '2026-11-30T15:59:59.999Z');
  });

  it('keeps the reservation board month end exclusive', () => {
    const range = monthRange(MANILA_MORNING_UTC, 'Asia/Manila');
    assert.deepEqual(range, { from: '2026-11-01', to: '2026-12-01' });
  });

  it('formats a calendar date in the business zone without shifting the day', () => {
    assert.equal(formatDate('2026-11-10', 'Asia/Manila'), 'Nov 10, 2026');
  });
});
