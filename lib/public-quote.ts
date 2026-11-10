import { guestBreakfastCharge, PUBLIC_BREAKFAST } from './breakfast-charge.ts';
import { calculateDownpayment, normalizeDownpaymentType } from './downpayment.ts';
import type { DownpaymentType } from '@/types/app';

function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/** Calendar nights between two YYYY-MM-DD dates. These are hotel-local dates, not UTC instants. */
export function stayNights(checkIn: string, checkOut: string): number {
  const [y1, m1, d1] = checkIn.split('-').map(Number);
  const [y2, m2, d2] = checkOut.split('-').map(Number);
  if (![y1, m1, d1, y2, m2, d2].every((part) => Number.isFinite(part))) return 0;
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  return Math.round((end - start) / 86400000);
}

export function isPastCheckIn(checkIn: string, today: string): boolean {
  return Boolean(checkIn) && checkIn < today;
}

export function guestCountAllowed(guestCount: number, capacity: number): boolean {
  const guests = Math.floor(Number(guestCount));
  const cap = Math.floor(Number(capacity));
  return guests >= 1 && cap >= 1 && guests <= cap;
}

/** Statuses that hold a room against a new online request. Tentative still does not. */
export const HOLDING_STATUSES = ['secured', 'checked_in', 'payment_submitted'] as const;

/**
 * Manual hotels with no configured amount fall back to 50% of the stay.
 * That default is flagged so staff can see it was not a hotel setting.
 */
export const MANUAL_DOWNPAYMENT_DEFAULT_PERCENT = 50;

export function resolveDownpayment(input: {
  downpaymentType: DownpaymentType | string;
  defaultPercent: number;
  defaultAmount: number;
  total: number;
  nightlyRate: number;
}): { amount: number; defaulted: boolean } {
  const type = normalizeDownpaymentType(input.downpaymentType);
  if (type === 'manual') {
    const fixed = Number(input.defaultAmount || 0);
    if (fixed > 0) return { amount: money(fixed), defaulted: false };
    const percent = Number(input.defaultPercent || 0);
    if (percent > 0) return { amount: money(input.total * percent / 100), defaulted: false };
    return { amount: money(input.total * MANUAL_DOWNPAYMENT_DEFAULT_PERCENT / 100), defaulted: true };
  }
  return {
    amount: money(calculateDownpayment({
      hotel: {
        downpayment_type: type,
        default_downpayment_percent: input.defaultPercent,
        default_downpayment_amount: input.defaultAmount
      },
      total: input.total,
      nightlyRate: input.nightlyRate
    })),
    defaulted: false
  };
}

export function paymentCoversDownpayment(paid: number, required: number): boolean {
  return Number.isFinite(paid) && paid + 0.001 >= Number(required || 0) && paid > 0;
}

export type StayQuote = {
  nights: number;
  nightlyRate: number;
  roomTotal: number;
  breakfastTotal: number;
  breakfastLine: string;
  total: number;
  downpaymentRequired: number;
  downpaymentDefaulted: boolean;
};

/** The number the guest sees, and the number stored on the reservation. Client totals are not an input. */
export function quotePublicStay(input: {
  nightlyRate: number;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  withBreakfast: boolean;
  downpaymentType: string;
  defaultPercent: number;
  defaultAmount: number;
}): StayQuote {
  const nights = Math.max(0, stayNights(input.checkIn, input.checkOut));
  const nightlyRate = money(input.nightlyRate);
  const roomTotal = money(nightlyRate * nights);
  const breakfast = input.withBreakfast
    ? guestBreakfastCharge(Math.max(nights, 1), input.guestCount)
    : null;
  const breakfastTotal = nights > 0 && breakfast ? breakfast.guestTotal : 0;
  const breakfastLine = input.withBreakfast && breakfast ? breakfast.line : 'Room only';
  const total = money(roomTotal + breakfastTotal);
  const down = resolveDownpayment({
    downpaymentType: input.downpaymentType,
    defaultPercent: input.defaultPercent,
    defaultAmount: input.defaultAmount,
    total,
    nightlyRate
  });
  return {
    nights,
    nightlyRate,
    roomTotal,
    breakfastTotal,
    breakfastLine,
    total,
    downpaymentRequired: down.amount,
    downpaymentDefaulted: down.defaulted
  };
}

export { PUBLIC_BREAKFAST };
