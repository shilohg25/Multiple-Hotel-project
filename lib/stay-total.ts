import { extraBedStillDue } from './breakfast-toggle.ts';
import { priceStay, roomAmountLabel } from './hotel-pricing.ts';
import { stayNights } from './public-quote.ts';

function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** Reprices a saved stay with the same function as the quote. The stored rate is already adjusted. */
export function stayMoneyBreakdown(input: {
  hotelSlug?: string | null;
  roomTypeName?: string | null;
  roomTotal: number;
  postedRoomRate?: number;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  guestCount: number;
  withBreakfast: boolean;
}) {
  const nights = Math.max(1, Math.floor(Number(input.nights) || stayNights(input.checkIn || '', input.checkOut || '') || 1));
  const nightlyRate = Number(input.postedRoomRate) > 0 ? Number(input.postedRoomRate) : money(input.roomTotal / nights);
  const price = priceStay({
    hotelSlug: input.hotelSlug,
    roomTypeName: input.roomTypeName,
    nightlyRate,
    nights,
    guestCount: input.guestCount,
    withBreakfast: input.withBreakfast,
    rateAlreadyAdjusted: true
  });
  return {
    room: price.roomTotal,
    extraBed: price.extraBedTotal,
    extraBedLine: price.extraBedLine,
    breakfast: price.breakfastTotal,
    breakfastLine: price.breakfastLine,
    breakfastIncluded: price.breakfastIncluded,
    total: price.total,
    nights
  };
}

/**
 * Shown total includes the extra bed priceStay expects, unless it is already posted
 * or the auto charge was deleted. `removed` is the same audit marker check-in uses.
 */
export function stayFolioView(input: {
  hotelSlug?: string | null;
  roomTypeName?: string | null;
  postedRoomRate?: number;
  roomTotal: number;
  nights?: number;
  guestCount: number;
  withBreakfast: boolean;
  removed?: boolean;
  charges?: Array<{ category?: string | null; notes?: string | null; total_amount?: number | null }>;
}) {
  const nights = Math.max(1, Math.floor(Number(input.nights) || 1));
  const nightlyRate = Number(input.postedRoomRate) > 0 ? Number(input.postedRoomRate) : money(Number(input.roomTotal || 0) / nights);
  const price = priceStay({
    hotelSlug: input.hotelSlug,
    roomTypeName: input.roomTypeName,
    nightlyRate,
    nights,
    guestCount: input.guestCount,
    withBreakfast: input.withBreakfast,
    rateAlreadyAdjusted: true
  });
  const charges = input.charges || [];
  const chargesTotal = money(charges.reduce((sum, charge) => sum + Number(charge.total_amount || 0), 0));
  const showExpected = extraBedStillDue({
    extraBedTotal: price.extraBedTotal,
    charges,
    removed: Boolean(input.removed)
  });
  const expectedExtraBed = showExpected ? price.extraBedTotal : 0;
  const roomTotal = money(input.roomTotal);
  return {
    roomLabel: roomAmountLabel(price.breakfastIncluded),
    breakfastIncluded: price.breakfastIncluded,
    expectedExtraBed,
    expectedExtraBedLine: showExpected ? price.extraBedLine : '',
    chargesTotal,
    total: money(roomTotal + chargesTotal + expectedExtraBed)
  };
}
