import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUTO_BREAKFAST_NOTE, AUTO_POST_SOURCE, breakfastTurnOffBlocked, canDeleteFolioCharge, isAutoPostedCharge, shouldPostAutoStayCharge } from './breakfast-toggle.ts';
import { currency } from './money.ts';
import { buildBookingConfirmationDraft } from './email-drafts.ts';
import { stayMoneyBreakdown } from './stay-total.ts';
import type { Guest, Hotel, Reservation } from '@/types/app';

describe('stay money in the confirmation email', () => {
  it('shows Navarro room, included breakfast, and the bank account for 1 night and 2 guests', () => {
    const amounts = stayMoneyBreakdown({
      hotelSlug: 'navarro-hotel',
      roomTotal: 2500,
      postedRoomRate: 2500,
      nights: 1,
      guestCount: 2,
      withBreakfast: true
    });
    assert.equal(amounts.room, 2500);
    assert.equal(amounts.breakfast, 0);
    assert.equal(amounts.extraBed, 0);
    assert.equal(amounts.total, 2500);

    const draft = buildBookingConfirmationDraft({
      hotel: { name: 'Navarro Hotel', slug: 'navarro-hotel', default_currency: 'PHP' } as Hotel,
      reservation: {
        total_amount: 2500,
        posted_room_rate: 2500,
        nights: 1,
        guest_count: 2,
        with_breakfast: true,
        check_in: '2026-11-10',
        check_out: '2026-11-11',
        downpayment_required: 1250,
        status: 'secured'
      } as Reservation,
      guest: { full_name: 'Ada' } as Guest
    });
    assert.equal(draft.body.includes(`Room: ${currency(2500)}`), true);
    assert.equal(draft.body.includes('Breakfast: Breakfast for 2 is included in the room rate'), true);
    assert.equal(draft.body.includes(`Total: ${currency(2500)}`), true);
    assert.equal(draft.body.includes('NAVSOT CORP'), true);
    assert.equal(draft.body.includes('GCash:'), false);
  });

  it('adds the Navarro extra bed for a third guest', () => {
    const amounts = stayMoneyBreakdown({
      hotelSlug: 'navarro-hotel',
      roomTotal: 5000,
      postedRoomRate: 2500,
      nights: 2,
      guestCount: 3,
      withBreakfast: true
    });
    assert.equal(amounts.extraBed, 1700);
    assert.equal(amounts.total, 6700);
  });
});

describe('breakfast toggle', () => {
  it('blocks turning breakfast off only when the auto-posted charge is still there', () => {
    assert.equal(breakfastTurnOffBlocked(true, false, true), true);
    assert.equal(breakfastTurnOffBlocked(true, 'false', true), true);
    assert.equal(breakfastTurnOffBlocked(true, false, false), false);
    assert.equal(isAutoPostedCharge({ category: 'breakfast', notes: AUTO_BREAKFAST_NOTE }), true);
    assert.equal(isAutoPostedCharge({ category: 'extra_bed', notes: AUTO_POST_SOURCE }), true);
    assert.equal(isAutoPostedCharge({ category: 'breakfast', notes: 'Extra breakfast added by staff' }), false);
    assert.equal(canDeleteFolioCharge('owner', { category: 'extra_bed', notes: AUTO_POST_SOURCE }), true);
    assert.equal(canDeleteFolioCharge('manager', { category: 'extra_bed', notes: AUTO_POST_SOURCE }), true);
    assert.equal(canDeleteFolioCharge('manager', { category: 'laundry', notes: 'Staff added' }), false);
    assert.equal(canDeleteFolioCharge('front_desk', { category: 'extra_bed', notes: AUTO_POST_SOURCE }), false);
  });

  it('does not post the automatic extra bed again after staff delete it', () => {
    assert.equal(shouldPostAutoStayCharge({
      status: 'checked_in',
      extraBedTotal: 1000,
      charges: [],
      removed: true
    }), false);
    assert.equal(shouldPostAutoStayCharge({
      status: 'checked_in',
      extraBedTotal: 1000,
      charges: [],
      removed: false
    }), true);
    assert.equal(shouldPostAutoStayCharge({
      status: 'checked_in',
      extraBedTotal: 1000,
      charges: [{ category: 'breakfast', notes: 'Extra breakfast added by staff' }],
      removed: false
    }), true);
    assert.equal(shouldPostAutoStayCharge({
      status: 'checked_in',
      extraBedTotal: 1000,
      charges: [{ category: 'extra_bed', notes: AUTO_POST_SOURCE }],
      removed: false
    }), false);
  });
});
