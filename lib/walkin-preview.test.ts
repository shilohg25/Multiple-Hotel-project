import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { quotePublicStay } from './public-quote.ts';
import { defaultWalkInCheckIn, stayDatesReady, walkInPreviewNights } from './walkin-preview.ts';

const MANILA_EVENING_UTC = new Date('2026-11-28T16:30:00.000Z');

describe('walk-in check-in default and preview', () => {
  it('defaults check-in to the hotel business today in Asia/Manila', () => {
    // 00:30 the next morning in Manila, still 16:30 UTC on Nov 28.
    assert.equal(MANILA_EVENING_UTC.toISOString().slice(0, 10), '2026-11-28');
    assert.equal(defaultWalkInCheckIn('Asia/Manila', MANILA_EVENING_UTC), '2026-11-29');
    assert.equal(defaultWalkInCheckIn(null, MANILA_EVENING_UTC), '2026-11-29');
    assert.equal(defaultWalkInCheckIn('Not/AZone', MANILA_EVENING_UTC), '2026-11-29');
  });

  it('uses the selected hotel timezone when it is not Manila', () => {
    const instant = new Date('2026-11-10T07:30:00.000Z');
    assert.equal(defaultWalkInCheckIn('Asia/Manila', instant), '2026-11-10');
    assert.equal(defaultWalkInCheckIn('America/Los_Angeles', instant), '2026-11-09');
  });

  it('does not treat dates as ready until check-out is after check-in', () => {
    assert.equal(stayDatesReady('', '2026-11-30'), false);
    assert.equal(stayDatesReady('2026-11-29', ''), false);
    assert.equal(stayDatesReady('', ''), false);
    assert.equal(stayDatesReady('2026-11-29', '2026-11-29'), false);
    assert.equal(stayDatesReady('2026-11-30', '2026-11-29'), false);
    assert.equal(stayDatesReady('2026-02-30', '2026-03-01'), false);
    assert.equal(stayDatesReady('2026-11-29', '2026-11-30'), true);
    assert.equal(walkInPreviewNights('', '2026-11-30'), null);
    assert.equal(walkInPreviewNights('2026-11-29', '2026-11-30'), 1);
    assert.equal(walkInPreviewNights('2026-11-29', '2026-12-01'), 2);
  });

  it('does not preview a stay total when check-in is missing and check-out is far away', () => {
    // The old form used fallback dates 2026-01-01..check-out, which turned a ₱2,250
    // nightly rate and a Nov 30 check-out into a 333-night ₱749,250 preview.
    assert.equal(stayDatesReady('', '2026-11-30'), false);
    assert.equal(walkInPreviewNights('', '2026-11-30'), null);

    const bogus = quotePublicStay({
      hotelSlug: 'test-demo-hotel',
      roomTypeName: 'TEST- Deluxe Queen',
      nightlyRate: 2250,
      checkIn: '2026-01-01',
      checkOut: '2026-11-30',
      guestCount: 1,
      withBreakfast: false,
      downpaymentType: 'percent',
      defaultPercent: 50,
      defaultAmount: 0
    });
    assert.equal(bogus.nights, 333);
    assert.equal(bogus.total, 749250);
    assert.ok(!stayDatesReady('', '2026-11-30'), 'preview must stay hidden instead of using those fallback dates');
  });
});
