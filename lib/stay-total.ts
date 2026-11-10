import { guestBreakfastCharge } from './breakfast-charge.ts';
import { stayNights } from './public-quote.ts';

function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** Room is stored on the stay. Breakfast comes from the shared charge rule. */
export function stayMoneyBreakdown(input: {
  roomTotal: number;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  guestCount: number;
  withBreakfast: boolean;
  breakfastRatePerRoom?: number;
}) {
  const room = money(input.roomTotal);
  const nights = Math.max(1, Math.floor(Number(input.nights) || stayNights(input.checkIn || '', input.checkOut || '') || 1));
  const breakfast = input.withBreakfast
    ? guestBreakfastCharge(nights, input.guestCount, input.breakfastRatePerRoom).guestTotal
    : 0;
  return { room, breakfast, total: money(room + breakfast), nights };
}
