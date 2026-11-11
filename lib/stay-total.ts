import { priceStay } from './hotel-pricing.ts';
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
    total: price.total,
    nights
  };
}
