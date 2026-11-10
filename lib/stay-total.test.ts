import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUTO_BREAKFAST_NOTE, breakfastTurnOffBlocked, isAutoBreakfastCharge, shouldPostAutoBreakfast } from './breakfast-toggle.ts';
import { currency } from './money.ts';
import { buildBookingConfirmationDraft } from './email-drafts.ts';
import { stayMoneyBreakdown } from './stay-total.ts';
import type { Guest, Hotel, Reservation } from '@/types/app';

describe('stay money in the confirmation email', () => {
  it('shows room, breakfast, and the combined total for 1 night and 2 guests', () => {
    const amounts = stayMoneyBreakdown({
      roomTotal: 2500,
      nights: 1,
      guestCount: 2,
      withBreakfast: true
    });
    assert.equal(amounts.room, 2500);
    assert.equal(amounts.breakfast, 500);
    assert.equal(amounts.total, 3000);

    const draft = buildBookingConfirmationDraft({
      hotel: { name: 'Navarro', default_currency: 'PHP', breakfast_rate_per_room: 0 } as Hotel,
      reservation: {
        total_amount: 2500,
        nights: 1,
        guest_count: 2,
        with_breakfast: true,
        check_in: '2026-11-10',
        check_out: '2026-11-11',
        downpayment_required: 1500,
        status: 'secured'
      } as Reservation,
      guest: { full_name: 'Ada' } as Guest
    });
    assert.equal(draft.body.includes(`Room: ${currency(2500)}`), true);
    assert.equal(draft.body.includes(`Breakfast: ${currency(500)}`), true);
    assert.equal(draft.body.includes(`Total: ${currency(3000)}`), true);
    assert.equal(draft.body.includes('Total amount:'), false);
  });

  it('uses the hotel breakfast rate when one is set', () => {
    const amounts = stayMoneyBreakdown({
      roomTotal: 2500,
      nights: 1,
      guestCount: 2,
      withBreakfast: true,
      breakfastRatePerRoom: 400
    });
    assert.equal(amounts.breakfast, 400);
    assert.equal(amounts.total, 2900);
  });
});

describe('breakfast toggle', () => {
  it('blocks turning breakfast off only when the auto-posted charge is still there', () => {
    assert.equal(breakfastTurnOffBlocked(true, false, true), true);
    assert.equal(breakfastTurnOffBlocked(true, 'false', true), true);
    assert.equal(breakfastTurnOffBlocked(true, false, false), false);
    assert.equal(isAutoBreakfastCharge({ category: 'breakfast', notes: AUTO_BREAKFAST_NOTE }), true);
    assert.equal(isAutoBreakfastCharge({ category: 'breakfast', notes: 'Extra breakfast added by staff' }), false);
  });

  it('does not post the auto breakfast charge again after staff delete it', () => {
    assert.equal(shouldPostAutoBreakfast({
      status: 'checked_in',
      withBreakfast: true,
      charges: [],
      removed: true
    }), false);
    assert.equal(shouldPostAutoBreakfast({
      status: 'checked_in',
      withBreakfast: true,
      charges: [],
      removed: false
    }), true);
    assert.equal(shouldPostAutoBreakfast({
      status: 'checked_in',
      withBreakfast: true,
      charges: [{ category: 'breakfast', notes: 'Extra breakfast added by staff' }],
      removed: false
    }), false);
  });
});
