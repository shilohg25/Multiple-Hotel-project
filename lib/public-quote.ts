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

/** `rooms.capacity` is the most guests the room can take, extra bed included. */
export function clampGuestCount(guestCount: number, capacity: number): number {
  const cap = Math.max(1, Math.floor(Number(capacity) || 1));
  const guests = Math.floor(Number(guestCount) || 1);
  return Math.min(cap, Math.max(1, guests));
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

/** A walk-in paid at the desk is saved as secured. Other sources use staffBookingPayment. */
export function walkInDeskStay(input: { bookingSource: string; deskPayment: number; downpaymentRequired: number; stayTotal?: number }):
  { ok: true; status: 'secured' } | { ok: false; error: string } {
  const result = staffBookingPayment({
    bookingSource: input.bookingSource,
    amount: input.deskPayment,
    downpaymentRequired: input.downpaymentRequired,
    stayTotal: input.stayTotal ?? Math.max(input.deskPayment, input.downpaymentRequired),
    paymentKind: 'desk_cash',
    canConfirm: true
  });
  if (!result.ok) return result;
  return { ok: true, status: 'secured' };
}

export const OTA_BOOKING_SOURCES = ['booking_dot_com', 'trip_dot_com', 'agoda', 'expedia'] as const;
export const ACCOUNT_BOOKING_SOURCES = ['lgu', 'company'] as const;

/**
 * These OTAs collect the full stay before the hotel sees the booking.
 * Expedia stays on the 50% rule until Shiloh says otherwise. Move it into this list to switch.
 */
export const FULL_PREPAID_OTA_SOURCES = ['booking_dot_com', 'trip_dot_com', 'agoda'] as const;

/**
 * Billed after the stay, with no deposit. Company stays on the 50% rule until Shiloh says otherwise.
 */
export const BILL_LATER_SOURCES = ['lgu'] as const;

/** Stored on reservations.mode_of_payment. Payments cannot be 0, so this marker holds the room without a payment row. */
export const TO_BE_BILLED_PREFIX = 'to_be_billed:';

export function toBeBilledMode(reference: string): string {
  return `${TO_BE_BILLED_PREFIX}${reference.trim()}`;
}

export function readToBeBilled(modeOfPayment: string | null | undefined): { reference: string } | null {
  const value = String(modeOfPayment || '');
  if (!value.startsWith(TO_BE_BILLED_PREFIX)) return null;
  return { reference: value.slice(TO_BE_BILLED_PREFIX.length) };
}

export type StaffPaymentKind = 'desk_cash' | 'ota_prepaid' | 'bank_transfer' | 'invoice';

export type StaffPaymentDecision = {
  ok: true;
  reservationStatus: 'secured' | 'payment_submitted';
  paymentStatus: 'confirmed' | 'submitted';
  method: 'cash' | 'bank_transfer' | 'booking_dot_com' | 'trip_dot_com' | 'other';
  details: string;
  reference: string;
  proofPath: string;
  /** False for an LGU stay that is billed later. No payment row is inserted. */
  recordPayment: boolean;
  /** False until money is actually received. OTA prepaid is received, so it is true. */
  writeLedger: boolean;
  /** Set on the reservation. Null leaves the column empty. */
  modeOfPayment: string | null;
  /** Cash in the drawer. OTA prepaid and a bill-later stay are never desk cash. */
  countsAsDeskCash: boolean;
};

function sameMoney(left: number, right: number): boolean {
  return Math.abs(Number(left) - Number(right)) <= 0.009;
}

/**
 * Staff stays hold a room only with a payment row in the same save, except an LGU
 * stay billed later, which is secured with no deposit and no ledger row.
 * Booking.com, Trip.com, and Agoda are recorded as OTA prepaid for the full stay,
 * with no proof file. Walk-ins, bank transfers, company stays, Expedia, and every
 * other source still need at least half the stay.
 * OTA prepaid and invoice/PO are stored on existing method values, with the name in the details.
 */
export function staffBookingPayment(input: {
  bookingSource: string;
  amount: number;
  downpaymentRequired: number;
  stayTotal: number;
  paymentKind?: string;
  reference?: string;
  otaName?: string;
  canConfirm: boolean;
}): StaffPaymentDecision | { ok: false; error: string } {
  const source = String(input.bookingSource || '');
  const kind = String(input.paymentKind || (source === 'walk_in' ? 'desk_cash' : '')) as StaffPaymentKind;
  const amount = Number(input.amount || 0);
  const reference = String(input.reference || '').trim();
  const otaName = String(input.otaName || '').trim();
  const ota = (OTA_BOOKING_SOURCES as readonly string[]).includes(source);
  const account = (ACCOUNT_BOOKING_SOURCES as readonly string[]).includes(source);
  if (source !== 'walk_in' && !ota && !account) {
    return { ok: false, error: 'Pencil bookings are not allowed. This source needs a payment record before the room is held.' };
  }
  if (source === 'walk_in' && kind !== 'desk_cash') {
    return { ok: false, error: 'A walk-in is recorded as cash paid at the desk.' };
  }
  if (ota && kind !== 'ota_prepaid' && kind !== 'bank_transfer') {
    return { ok: false, error: 'An OTA stay needs an OTA prepaid record or a bank transfer.' };
  }
  if (account && kind !== 'invoice' && kind !== 'bank_transfer') {
    return { ok: false, error: 'An LGU or company stay needs an invoice or PO, or a bank transfer.' };
  }
  const fullPrepaid = kind === 'ota_prepaid' && (FULL_PREPAID_OTA_SOURCES as readonly string[]).includes(source);
  const billLater = kind === 'invoice' && (BILL_LATER_SOURCES as readonly string[]).includes(source);
  if ((kind === 'ota_prepaid' || kind === 'bank_transfer' || kind === 'invoice') && !reference) {
    return { ok: false, error: kind === 'invoice' ? 'An invoice or billing reference is required.' : 'A reference number is required.' };
  }
  if (kind === 'ota_prepaid' && !otaName) return { ok: false, error: 'The OTA name is required.' };
  if (billLater) {
    if (amount > 0.009) return { ok: false, error: 'An LGU stay is billed later. Do not record a deposit.' };
    return {
      ok: true,
      reservationStatus: 'secured',
      paymentStatus: 'submitted',
      method: 'other',
      details: `To be billed ${reference}`,
      reference,
      proofPath: 'staff/no-proof',
      recordPayment: false,
      writeLedger: false,
      modeOfPayment: toBeBilledMode(reference),
      countsAsDeskCash: false
    };
  }
  if (!(amount > 0)) return { ok: false, error: 'A room cannot be held without a payment record.' };
  if (!paymentWithinStay(amount, input.stayTotal)) {
    return { ok: false, error: 'The payment cannot be more than the stay total.' };
  }
  if (fullPrepaid) {
    if (!sameMoney(amount, input.stayTotal)) {
      return { ok: false, error: 'OTA prepaid must equal the stay total. The OTA collects the full stay.' };
    }
  } else if (!paymentCoversDownpayment(amount, input.downpaymentRequired)) {
    return { ok: false, error: 'The payment must cover at least half the stay.' };
  }

  const managerConfirms = fullPrepaid || source === 'walk_in' || input.canConfirm;
  let method: StaffPaymentDecision['method'] = 'other';
  let details = '';
  if (kind === 'desk_cash') {
    method = 'cash';
    details = 'Paid at the desk';
  } else if (kind === 'bank_transfer') {
    method = 'bank_transfer';
    details = 'Bank transfer';
  } else if (kind === 'invoice') {
    method = 'other';
    details = `Invoice/PO ${reference}`;
  } else if (source === 'booking_dot_com') {
    method = 'booking_dot_com';
    details = `OTA prepaid: ${otaName}`;
  } else if (source === 'trip_dot_com') {
    method = 'trip_dot_com';
    details = `OTA prepaid: ${otaName}`;
  } else {
    method = 'other';
    details = `OTA prepaid: ${otaName}`;
  }
  const paymentStatus = managerConfirms ? 'confirmed' : 'submitted';
  return {
    ok: true,
    reservationStatus: managerConfirms ? 'secured' : 'payment_submitted',
    paymentStatus,
    method,
    details,
    reference,
    proofPath: kind === 'desk_cash' ? 'walk-in/desk-cash' : 'staff/no-proof',
    recordPayment: true,
    writeLedger: paymentStatus === 'confirmed',
    modeOfPayment: null,
    countsAsDeskCash: method === 'cash'
  };
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
