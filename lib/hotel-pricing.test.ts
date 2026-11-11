import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { autoChargeRemovedFromRead, extraBedStillDue, shouldPostAutoStayCharge } from './breakfast-toggle.ts';
import { priceStay, roomAmountLabel } from './hotel-pricing.ts';
import { paymentAccountForHotel, paymentInstructionLines } from './payment-instructions.ts';
import { paymentWithinStay, quotePublicStay } from './public-quote.ts';
import { stayFolioView } from './stay-total.ts';

const nights = { checkIn: '2026-11-10', checkOut: '2026-11-12' };

describe('hotel stay pricing', () => {
  it('prices Tagosilangan: breakfast for 2 is in the room, extra guests are a ₱500 bed', () => {
    const two = quotePublicStay({
      hotelSlug: 'tagosilangan',
      roomTypeName: 'Barkada',
      nightlyRate: 2500,
      ...nights,
      guestCount: 2,
      withBreakfast: false,
      downpaymentType: 'manual',
      defaultPercent: 0,
      defaultAmount: 0
    });
    assert.equal(two.withBreakfast, true);
    assert.equal(two.breakfastChoiceEnabled, false);
    assert.equal(two.breakfastTotal, 0);
    assert.equal(two.roomTotal, 5000);
    assert.equal(two.extraBedTotal, 0);
    assert.equal(two.total, 5000);
    assert.equal(two.downpaymentRequired, 2500);

    const three = quotePublicStay({
      hotelSlug: 'tagosilangan',
      roomTypeName: 'Barkada',
      nightlyRate: 2500,
      ...nights,
      guestCount: 3,
      withBreakfast: true,
      downpaymentType: 'percent',
      defaultPercent: 10,
      defaultAmount: 0
    });
    assert.equal(three.roomTotal, 5000);
    assert.equal(three.extraBedTotal, 1000);
    assert.equal(three.total, 6000);
    assert.equal(three.downpaymentRequired, 3000);
    const posted = priceStay({
      hotelSlug: 'tagosilangan',
      roomTypeName: 'Barkada',
      nightlyRate: three.nightlyRate,
      nights: three.nights,
      guestCount: 3,
      withBreakfast: true,
      rateAlreadyAdjusted: true
    });
    assert.equal(posted.extraBedTotal, three.extraBedTotal);
    assert.equal(three.roomTotal + posted.extraBedTotal, three.total);
  });

  it('prices Navarro at ₱2,500 for 2 nights, with and without breakfast', () => {
    const base = {
      hotelSlug: 'navarro-hotel',
      roomTypeName: 'Deluxe King',
      nightlyRate: 2500,
      ...nights,
      downpaymentType: 'percent',
      defaultPercent: 50,
      defaultAmount: 0
    };
    const twoBreakfast = quotePublicStay({ ...base, guestCount: 2, withBreakfast: true });
    assert.equal(twoBreakfast.breakfastChoiceEnabled, true);
    assert.equal(twoBreakfast.roomTotal, 5000);
    assert.equal(twoBreakfast.extraBedTotal, 0);
    assert.equal(twoBreakfast.total, 5000);

    const twoRoomOnly = quotePublicStay({ ...base, guestCount: 2, withBreakfast: false });
    assert.equal(twoRoomOnly.withBreakfast, false);
    assert.equal(twoRoomOnly.roomTotal, 4500);
    assert.equal(twoRoomOnly.total, 4500);
    assert.equal(roomAmountLabel(twoRoomOnly.breakfastIncluded), 'Room only');

    const threeRoomOnly = quotePublicStay({ ...base, guestCount: 3, withBreakfast: false });
    assert.equal(threeRoomOnly.roomTotal, 4500);
    assert.equal(threeRoomOnly.extraBedRate, 600);
    assert.equal(threeRoomOnly.extraBedTotal, 1200);
    assert.equal(threeRoomOnly.total, 5700);

    const threeBreakfast = quotePublicStay({ ...base, guestCount: 3, withBreakfast: true });
    assert.equal(threeBreakfast.roomTotal, 5000);
    assert.equal(threeBreakfast.extraBedRate, 850);
    assert.equal(threeBreakfast.extraBedTotal, 1700);
    assert.equal(threeBreakfast.total, 6700);

    const practice = quotePublicStay({ ...base, hotelSlug: 'test-practice-hotel', guestCount: 2, withBreakfast: false });
    assert.equal(practice.breakfastChoiceEnabled, true);
    assert.equal(practice.total, 4500);
  });

  it('applies a Navarro room-only discount only when that amount is set', () => {
    const roomOnly = priceStay({
      hotelSlug: 'navarro-hotel',
      nightlyRate: 2500,
      nights: 2,
      guestCount: 3,
      withBreakfast: false,
      roomOnlyDiscountPerNight: 400
    });
    assert.equal(roomOnly.breakfastChoiceEnabled, true);
    assert.equal(roomOnly.withBreakfast, false);
    assert.equal(roomOnly.nightlyRate, 2100);
    assert.equal(roomOnly.roomTotal, 4200);
    assert.equal(roomOnly.extraBedRate, 600);
    assert.equal(roomOnly.extraBedTotal, 1200);
    assert.equal(roomOnly.total, 5400);

    const withBreakfast = priceStay({
      hotelSlug: 'navarro-hotel',
      nightlyRate: 2500,
      nights: 2,
      guestCount: 3,
      withBreakfast: true,
      roomOnlyDiscountPerNight: 400
    });
    assert.equal(withBreakfast.nightlyRate, 2500);
    assert.equal(withBreakfast.extraBedRate, 850);
    assert.equal(withBreakfast.total, 6700);
  });

  it('maps TEST hotels to Navarro and Tagosilangan rates without real payment details', () => {
    const hotel = priceStay({
      hotelSlug: 'test-practice-hotel',
      nightlyRate: 2000,
      nights: 2,
      guestCount: 3,
      withBreakfast: true
    });
    assert.equal(hotel.breakfastIncluded, true);
    assert.equal(hotel.breakfastTotal, 0);
    assert.equal(hotel.extraBedRate, 850);
    assert.equal(hotel.extraBedTotal, 1700);
    assert.equal(roomAmountLabel(hotel.breakfastIncluded), 'Room (breakfast for 2 included)');

    const resort = priceStay({
      hotelSlug: 'test-practice-resort',
      nightlyRate: 2000,
      nights: 2,
      guestCount: 3,
      withBreakfast: false
    });
    assert.equal(resort.extraBedRate, 500);
    assert.equal(resort.extraBedTotal, 1000);
    assert.equal(paymentAccountForHotel({ slug: 'test-practice-hotel' }).placeholder, true);
    assert.equal(paymentAccountForHotel({ slug: 'test-practice-resort' }).placeholder, true);

    const unknown = priceStay({
      hotelSlug: 'somewhere-else',
      nightlyRate: 2000,
      nights: 2,
      guestCount: 3,
      withBreakfast: true
    });
    assert.equal(unknown.breakfastIncluded, false);
    assert.equal(unknown.extraBedTotal, 0);
    assert.equal(roomAmountLabel(unknown.breakfastIncluded), 'Room only');
  });

  it('shows the extra bed in the folio total before check-in, and the payment cap uses that total', () => {
    const quote = quotePublicStay({
      hotelSlug: 'navarro-hotel',
      nightlyRate: 1000,
      checkIn: '2026-11-10',
      checkOut: '2026-11-11',
      guestCount: 5,
      withBreakfast: true,
      downpaymentType: 'percent',
      defaultPercent: 50,
      defaultAmount: 0
    });
    const folio = stayFolioView({
      hotelSlug: 'navarro-hotel',
      postedRoomRate: quote.nightlyRate,
      roomTotal: quote.roomTotal,
      nights: quote.nights,
      guestCount: 5,
      withBreakfast: true,
      charges: []
    });
    assert.equal(quote.roomTotal, 1000);
    assert.equal(quote.extraBedTotal, 2550);
    assert.equal(folio.expectedExtraBed, 2550);
    assert.equal(folio.total, quote.total);
    assert.equal(quote.downpaymentRequired <= folio.total, true);
    assert.equal(quote.downpaymentRequired > quote.roomTotal, true);
    assert.equal(paymentWithinStay(quote.total, folio.total), true);
    assert.equal(paymentWithinStay(quote.total + 1, folio.total), false);
    const afterCheckIn = stayFolioView({
      hotelSlug: 'navarro-hotel',
      postedRoomRate: 1000,
      roomTotal: 1000,
      nights: 1,
      guestCount: 5,
      withBreakfast: true,
      charges: [{ category: 'extra_bed', total_amount: 2550 }]
    });
    assert.equal(afterCheckIn.expectedExtraBed, 0);
    assert.equal(afterCheckIn.total, 3550);
  });

  it('drops the expected extra bed after the auto charge is deleted', () => {
    const stay = {
      hotelSlug: 'navarro-hotel',
      postedRoomRate: 2500,
      roomTotal: 5000,
      nights: 2,
      guestCount: 3,
      withBreakfast: true
    };
    const before = stayFolioView({ ...stay, charges: [], removed: false });
    assert.equal(before.expectedExtraBed, 1700);
    assert.equal(before.expectedExtraBedLine.includes('850'), true);
    assert.equal(before.total, 6700);
    assert.equal(shouldPostAutoStayCharge({
      status: 'checked_in',
      extraBedTotal: before.expectedExtraBed,
      charges: [],
      removed: false
    }), true);

    const posted = stayFolioView({
      ...stay,
      removed: false,
      charges: [{ category: 'extra_bed', notes: 'source:auto', total_amount: 1700 }]
    });
    assert.equal(posted.expectedExtraBed, 0);
    assert.equal(posted.total, 6700);

    const deleted = stayFolioView({ ...stay, charges: [], removed: true });
    assert.equal(extraBedStillDue({ extraBedTotal: 1700, charges: [], removed: true }), false);
    assert.equal(shouldPostAutoStayCharge({
      status: 'checked_in',
      extraBedTotal: 1700,
      charges: [],
      removed: true
    }), false);
    assert.equal(deleted.expectedExtraBed, 0);
    assert.equal(deleted.expectedExtraBedLine, '');
    assert.equal(deleted.total, 5000);
    assert.equal(paymentWithinStay(6700, deleted.total), false);
    assert.equal(paymentWithinStay(deleted.total, deleted.total), true);
  });

  it('cuts the required down payment to half the shown total after the extra bed is removed', () => {
    const stay = {
      hotelSlug: 'navarro-hotel',
      postedRoomRate: 1000,
      roomTotal: 1000,
      nights: 1,
      guestCount: 5,
      withBreakfast: true
    };
    const posted = stayFolioView({
      ...stay,
      removed: false,
      charges: [{ category: 'extra_bed', notes: 'source:auto', total_amount: 2550 }]
    });
    assert.equal(posted.total, 3550);
    assert.equal(posted.downpaymentRequired, 1775);
    const removed = stayFolioView({ ...stay, charges: [], removed: true });
    assert.equal(removed.total, 1000);
    assert.equal(removed.expectedExtraBed, 0);
    assert.equal(removed.downpaymentRequired, 500);
    assert.equal(autoChargeRemovedFromRead({ message: 'audit read failed' }, [{ id: 'row' }]), false);
    assert.equal(autoChargeRemovedFromRead(null, [{ id: 'row' }]), true);
  });
});

describe('payment instructions', () => {
  it('shows Tagosilangan GCash and bank, and hides Navarro GCash', () => {
    const tago = paymentAccountForHotel({ slug: 'tagosilangan' });
    assert.equal(tago.gcash?.name, 'Ezra Gelito');
    assert.equal(tago.gcash?.number, '09691506919');
    assert.equal(tago.bankAccountNumber, '128-7-12856069-2');
    const navarro = paymentInstructionLines({ slug: 'navarro-hotel' });
    assert.equal(navarro.some((line) => line.startsWith('GCash:')), false);
    assert.equal(navarro.some((line) => line.includes('NAVSOT CORP')), true);
    assert.equal(navarro.some((line) => line.includes('571-7-57102073-0')), true);
    const practice = paymentAccountForHotel({ slug: 'test-practice-hotel' });
    assert.equal(practice.placeholder, true);
    assert.equal(practice.gcash, null);
    assert.equal(practice.bankName, 'Metrobank');
    const practiceLines = paymentInstructionLines({ slug: 'test-practice-hotel' });
    assert.equal(practiceLines.some((line) => line.startsWith('GCash:')), false);
    assert.equal(practiceLines.some((line) => line.includes('PLACEHOLDER account number')), true);
    assert.equal(practiceLines.some((line) => line.includes('571-7-57102073-0')), false);
  });
});
