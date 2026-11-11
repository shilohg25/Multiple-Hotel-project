import { calculateDownpayment, normalizeDownpaymentType } from './downpayment.ts';
import { priceStay } from './hotel-pricing.ts';
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

export const MAX_PUBLIC_STAY_NIGHTS = 30;

export function paymentCoversDownpayment(paid: number, required: number): boolean {
  return Number.isFinite(paid) && paid + 0.001 >= Number(required || 0) && paid > 0;
}

export function paymentWithinStay(paid: number, stayTotal: number): boolean {
  return Number.isFinite(paid) && paid <= Number(stayTotal || 0) + 0.001;
}

/** Reasons the public form keeps Submit off. A typed date can pass the input min. */
export function publicFormHold(input: {
  datesReady: boolean;
  checkIn: string;
  today: string;
  guestCount: number;
  capacity: number;
  nights: number;
  paidText?: string;
  stayTotal?: number;
  downpaymentRequired?: number;
  proofSelected?: boolean;
}) {
  const pastCheckIn = isPastCheckIn(input.checkIn, input.today);
  const overCapacity = Math.floor(Number(input.guestCount)) > Math.floor(Number(input.capacity));
  const stayTooLong = input.nights > MAX_PUBLIC_STAY_NIGHTS;
  const paidText = String(input.paidText ?? '').trim();
  const paymentTooHigh = input.stayTotal != null && paidText !== '' && !paymentWithinStay(Number(paidText), input.stayTotal);
  const paymentTooLow = input.downpaymentRequired != null && (paidText === '' || !paymentCoversDownpayment(Number(paidText), input.downpaymentRequired));
  const missingProof = input.proofSelected === false;
  return {
    pastCheckIn,
    overCapacity,
    stayTooLong,
    paymentTooHigh,
    paymentTooLow,
    missingProof,
    submitDisabled: !input.datesReady || pastCheckIn || overCapacity || stayTooLong || paymentTooHigh || paymentTooLow || missingProof
  };
}

/** A walk-in paid at the desk is the only staff stay that may hold a room. */
export function walkInDeskStay(input: { bookingSource: string; deskPayment: number; downpaymentRequired: number }):
  { ok: true; status: 'secured' } | { ok: false; error: string } {
  if (input.bookingSource !== 'walk_in') {
    return { ok: false, error: 'Pencil bookings are not allowed. Only a walk-in paid at the desk can be saved here.' };
  }
  if (!paymentCoversDownpayment(input.deskPayment, input.downpaymentRequired)) {
    return { ok: false, error: 'A room cannot be held without payment. Enter the amount paid at the desk. It must cover the down payment.' };
  }
  return { ok: true, status: 'secured' };
}

export type StayQuote = {
  nights: number;
  nightlyRate: number;
  roomTotal: number;
  extraBedRate: number;
  extraBedTotal: number;
  extraBedLine: string;
  breakfastTotal: number;
  breakfastLine: string;
  breakfastIncluded: boolean;
  breakfastChoiceEnabled: boolean;
  withBreakfast: boolean;
  total: number;
  fixedDownpaymentPercent: number | null;
  downpaymentRequired: number;
  downpaymentDefaulted: boolean;
};

/**
 * Guest-facing quote. `total` is the room plus extra beds. Breakfast included in the
 * room rate is not added again. The stay stores `roomTotal` only. Check-in posts the
 * extra-bed charge, so the folio matches this total. Navarro and Tagosilangan take
 * 50% of that total, computed here.
 */
export function quotePublicStay(input: {
  hotelSlug?: string | null;
  roomTypeName?: string | null;
  nightlyRate: number;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  withBreakfast: boolean;
  downpaymentType: string;
  defaultPercent: number;
  defaultAmount: number;
  roomOnlyDiscountPerNight?: number | null;
}): StayQuote {
  const nights = Math.max(0, stayNights(input.checkIn, input.checkOut));
  const price = priceStay({
    hotelSlug: input.hotelSlug,
    roomTypeName: input.roomTypeName,
    nightlyRate: input.nightlyRate,
    nights,
    guestCount: input.guestCount,
    withBreakfast: input.withBreakfast,
    roomOnlyDiscountPerNight: input.roomOnlyDiscountPerNight
  });
  const down = price.fixedDownpaymentPercent != null
    ? { amount: money(price.total * price.fixedDownpaymentPercent / 100), defaulted: false }
    : resolveDownpayment({
      downpaymentType: input.downpaymentType,
      defaultPercent: input.defaultPercent,
      defaultAmount: input.defaultAmount,
      total: price.total,
      nightlyRate: price.nightlyRate
    });
  return {
    nights: price.nights,
    nightlyRate: price.nightlyRate,
    roomTotal: price.roomTotal,
    extraBedRate: price.extraBedRate,
    extraBedTotal: price.extraBedTotal,
    extraBedLine: price.extraBedLine,
    breakfastTotal: price.breakfastTotal,
    breakfastLine: price.breakfastLine,
    breakfastIncluded: price.breakfastIncluded,
    breakfastChoiceEnabled: price.breakfastChoiceEnabled,
    withBreakfast: price.withBreakfast,
    total: price.total,
    fixedDownpaymentPercent: price.fixedDownpaymentPercent,
    downpaymentRequired: down.amount,
    downpaymentDefaulted: down.defaulted
  };
}
