import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paymentGuestLabel } from './report-payment-guest.ts';

describe('paymentGuestLabel', () => {
  it('uses the guest name from the already-fetched stay join', () => {
    assert.equal(
      paymentGuestLabel({
        reservations: { guests: { full_name: 'TEST- Dan Online' }, rooms: { name: 'TEST- 201' } }
      }),
      'TEST- Dan Online'
    );
  });

  it('reads a guest or room when Supabase returns them as arrays', () => {
    assert.equal(
      paymentGuestLabel({
        reservations: [{ guests: [{ full_name: 'TEST- Walkin Wendy' }], rooms: [{ name: 'TEST- 204' }] }]
      }),
      'TEST- Walkin Wendy'
    );
  });

  it('falls back to the room name when the guest name is missing or blank', () => {
    assert.equal(
      paymentGuestLabel({ reservations: { guests: { full_name: '  ' }, rooms: { name: 'TEST- 201' } } }),
      'TEST- 201'
    );
    assert.equal(
      paymentGuestLabel({ reservations: { rooms: { name: 'TEST- 301' } } }),
      'TEST- 301'
    );
  });

  it("falls back to Guest when there is no name and no room", () => {
    assert.equal(paymentGuestLabel({}), 'Guest');
    assert.equal(paymentGuestLabel({ reservations: { guests: { full_name: null }, rooms: { name: '' } } }), 'Guest');
  });

  it('does not use a reservation id chunk as the label', () => {
    const label = paymentGuestLabel({
      reservations: { guests: { full_name: 'TEST- Ada Arrival' }, rooms: { name: 'TEST- 201' } }
    });
    assert.equal(label, 'TEST- Ada Arrival');
    assert.equal(label.includes('D6000000'), false);
    assert.equal(/^[0-9A-F]{8}$/.test(label), false);
  });
});
