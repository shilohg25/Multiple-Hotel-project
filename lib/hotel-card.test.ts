import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hotelCardBadges, hotelDownpaymentSummary } from './hotel-card.ts';

describe('hotel card badges', () => {
  it('does not show Ready on an inactive hotel that already has rooms', () => {
    assert.deepEqual(hotelCardBadges(false, false), [{ kind: 'inactive', label: 'Inactive' }]);
  });

  it('shows Setup needed with Inactive when the hotel has no active rooms', () => {
    assert.deepEqual(hotelCardBadges(false, true), [
      { kind: 'inactive', label: 'Inactive' },
      { kind: 'setup', label: 'Setup needed' }
    ]);
  });

  it('shows Active and Ready when the hotel can take reservations', () => {
    assert.deepEqual(hotelCardBadges(true, false), [
      { kind: 'active', label: 'Active' },
      { kind: 'ready', label: 'Ready' }
    ]);
  });

  it('shows Active and Setup needed when the hotel is on but has no rooms', () => {
    assert.deepEqual(hotelCardBadges(true, true), [
      { kind: 'active', label: 'Active' },
      { kind: 'setup', label: 'Setup needed' }
    ]);
  });
});

describe('hotel down payment summary', () => {
  const base = {
    default_downpayment_percent: 50,
    default_downpayment_amount: 1000,
    default_currency: 'PHP'
  };

  it('explains a percentage down payment in plain words', () => {
    assert.equal(
      hotelDownpaymentSummary({ ...base, downpayment_type: 'percent' }),
      'Down payment: 50% of the stay total'
    );
  });

  it('explains a fixed, first-night, and manual down payment', () => {
    assert.equal(
      hotelDownpaymentSummary({ ...base, downpayment_type: 'fixed' }),
      'Down payment: ₱1,000.00 fixed amount'
    );
    assert.equal(
      hotelDownpaymentSummary({ ...base, downpayment_type: 'first_night' }),
      'Down payment: first-night room rate'
    );
    assert.equal(
      hotelDownpaymentSummary({ ...base, downpayment_type: 'manual' }),
      'Down payment: set on each booking'
    );
  });
});
