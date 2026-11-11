/**
 * Per-hotel stay pricing. Quote, staff totals, and check-in all call priceStay.
 *
 * Navarro room only is ₱250 off each night. Extra beds are ₱850 with breakfast
 * and ₱600 without. Tagosilangan has no room-only choice.
 */
export const navarroRoomOnlyDiscount: number | null = 250;

export const NAVARRO_SLUG = 'navarro-hotel';
export const TAGOSILANGAN_SLUG = 'tagosilangan';
/** TEST properties use a real hotel's rates so extra beds can be tried on TEST data. Payment details stay placeholders. */
export const TEST_PRACTICE_HOTEL_SLUG = 'test-practice-hotel';
export const TEST_PRACTICE_RESORT_SLUG = 'test-practice-resort';

export type RoomTypePricing = {
  includedHeads: number;
  breakfastInRoomRate: boolean;
  /** Pesos taken off each night when the guest chooses room only. null hides that choice. */
  roomOnlyDiscountPerNight: number | null;
  extraBedPerPaxPerNightWithBreakfast: number;
  extraBedPerPaxPerNightRoomOnly: number;
  /** Both named hotels take 50% of the stay total. null keeps the hotel's own setting. */
  fixedDownpaymentPercent: number | null;
};

export type HotelPricing = RoomTypePricing & {
  slug: string;
  roomTypes: Record<string, Partial<RoomTypePricing>>;
};

const tagosilanganDefault: RoomTypePricing = {
  includedHeads: 2,
  breakfastInRoomRate: true,
  roomOnlyDiscountPerNight: null,
  extraBedPerPaxPerNightWithBreakfast: 500,
  extraBedPerPaxPerNightRoomOnly: 500,
  fixedDownpaymentPercent: 50
};

const navarroDefault: RoomTypePricing = {
  includedHeads: 2,
  breakfastInRoomRate: true,
  roomOnlyDiscountPerNight: navarroRoomOnlyDiscount,
  extraBedPerPaxPerNightWithBreakfast: 850,
  extraBedPerPaxPerNightRoomOnly: 600,
  fixedDownpaymentPercent: 50
};

/** Hotels that are not Navarro, Tagosilangan, or a mapped TEST property. */
const genericDefault: RoomTypePricing = {
  includedHeads: 2,
  breakfastInRoomRate: false,
  roomOnlyDiscountPerNight: 0,
  extraBedPerPaxPerNightWithBreakfast: 0,
  extraBedPerPaxPerNightRoomOnly: 0,
  fixedDownpaymentPercent: null
};

const navarroTypes = {
  'deluxe queen': {},
  'deluxe twin': {},
  'deluxe king': {},
  barkada: {}
};

const HOTELS: Record<string, HotelPricing> = {
  [TAGOSILANGAN_SLUG]: {
    slug: TAGOSILANGAN_SLUG,
    ...tagosilanganDefault,
    roomTypes: { barkada: {} }
  },
  [TEST_PRACTICE_RESORT_SLUG]: {
    slug: TEST_PRACTICE_RESORT_SLUG,
    ...tagosilanganDefault,
    roomTypes: { barkada: {} }
  },
  [NAVARRO_SLUG]: {
    slug: NAVARRO_SLUG,
    ...navarroDefault,
    roomTypes: navarroTypes
  },
  [TEST_PRACTICE_HOTEL_SLUG]: {
    slug: TEST_PRACTICE_HOTEL_SLUG,
    ...navarroDefault,
    roomTypes: navarroTypes
  }
};

function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function typeKey(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

export function stayPricingFor(input: { slug?: string | null; roomTypeName?: string | null }): RoomTypePricing {
  const hotel = HOTELS[typeKey(input.slug)] || { slug: typeKey(input.slug), ...genericDefault, roomTypes: {} };
  const override = hotel.roomTypes[typeKey(input.roomTypeName)] || {};
  return { ...hotel, ...override };
}

export function roomOnlyChoiceEnabled(pricing: RoomTypePricing, discountOverride?: number | null): boolean {
  const discount = discountOverride === undefined ? pricing.roomOnlyDiscountPerNight : discountOverride;
  return pricing.breakfastInRoomRate && discount != null;
}

export type StayPrice = {
  nights: number;
  guestCount: number;
  includedHeads: number;
  extraPax: number;
  withBreakfast: boolean;
  breakfastChoiceEnabled: boolean;
  breakfastIncluded: boolean;
  nightlyRate: number;
  roomTotal: number;
  extraBedRate: number;
  extraBedTotal: number;
  extraBedLine: string;
  breakfastTotal: number;
  breakfastLine: string;
  total: number;
  fixedDownpaymentPercent: number | null;
};

/**
 * One stay price. Breakfast included in the room rate is not a second charge.
 * Guests past the included heads are extra beds. Pass rateAlreadyAdjusted when
 * nightlyRate is the rate already stored on the stay, so a room-only discount
 * is not taken twice.
 */
export function priceStay(input: {
  hotelSlug?: string | null;
  roomTypeName?: string | null;
  nightlyRate: number;
  nights: number;
  guestCount: number;
  withBreakfast: boolean;
  rateAlreadyAdjusted?: boolean;
  roomOnlyDiscountPerNight?: number | null;
}): StayPrice {
  const pricing = stayPricingFor({ slug: input.hotelSlug, roomTypeName: input.roomTypeName });
  const nights = Math.max(0, Math.floor(Number(input.nights) || 0));
  const guestCount = Math.max(1, Math.floor(Number(input.guestCount) || 1));
  const choiceEnabled = roomOnlyChoiceEnabled(pricing, input.roomOnlyDiscountPerNight);
  const discountPerNight = input.roomOnlyDiscountPerNight === undefined
    ? pricing.roomOnlyDiscountPerNight
    : input.roomOnlyDiscountPerNight;
  const withBreakfast = pricing.breakfastInRoomRate ? (choiceEnabled ? Boolean(input.withBreakfast) : true) : Boolean(input.withBreakfast);
  const discount = !input.rateAlreadyAdjusted && !withBreakfast && choiceEnabled ? Number(discountPerNight || 0) : 0;
  const nightlyRate = money(Math.max(0, Number(input.nightlyRate || 0) - discount));
  const roomTotal = money(nightlyRate * nights);
  const extraPax = Math.max(0, guestCount - pricing.includedHeads);
  const billBreakfast = pricing.breakfastInRoomRate ? withBreakfast : false;
  const extraBedRate = billBreakfast ? pricing.extraBedPerPaxPerNightWithBreakfast : pricing.extraBedPerPaxPerNightRoomOnly;
  const extraBedTotal = nights > 0 ? money(extraBedRate * extraPax * nights) : 0;
  const extraBedLine = extraPax === 0
    ? 'No extra bed'
    : `Extra bed ₱${extraBedRate} × ${extraPax} guest(s) × ${nights} night(s)`;
  const breakfastIncluded = pricing.breakfastInRoomRate && withBreakfast;
  const breakfastLine = breakfastIncluded
    ? `Breakfast for ${pricing.includedHeads} is included in the room rate`
    : 'Room only';
  return {
    nights,
    guestCount,
    includedHeads: pricing.includedHeads,
    extraPax,
    withBreakfast: breakfastIncluded,
    breakfastChoiceEnabled: choiceEnabled,
    breakfastIncluded,
    nightlyRate,
    roomTotal,
    extraBedRate,
    extraBedTotal,
    extraBedLine,
    breakfastTotal: 0,
    breakfastLine,
    total: money(roomTotal + extraBedTotal),
    fixedDownpaymentPercent: pricing.fixedDownpaymentPercent
  };
}

export function roomAmountLabel(breakfastIncluded: boolean): string {
  return breakfastIncluded ? 'Room (breakfast for 2 included)' : 'Room only';
}
