import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatHotelTime, hourlyCharge } from './stay-hours.ts';

describe('stay hours', () => {
  it('charges each hour at the property rate', () => {
    assert.equal(hourlyCharge(3, 200), 600);
  });

  it('shows 2:00 PM check-in and 12:00 noon check-out', () => {
    assert.equal(formatHotelTime('14:00:00', '14:00'), '2:00 PM');
    assert.equal(formatHotelTime(null, '12:00'), '12:00 PM');
  });
});