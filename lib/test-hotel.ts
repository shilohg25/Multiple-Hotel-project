/**
 * Public-facing guard for practice hotels whose names start with TEST-.
 * Staff and signed-in screens should keep using the hotels table as usual.
 */

export const TEST_HOTEL_NAME_PREFIX = 'TEST-';

/** PostgREST ILIKE pattern for a name that starts with TEST- (case-insensitive). */
export const TEST_HOTEL_NAME_ILIKE = 'TEST-%';

export const PUBLIC_TEST_HOTEL_REFUSAL = 'That property is not available.';

/** True when the trimmed name starts with TEST-, ignoring case. */
export function isTestHotel(name: unknown): boolean {
  return String(name ?? '').trim().toLowerCase().startsWith('test-');
}

type NameFilterQuery<T> = {
  not: (column: string, operator: string, value: string) => T;
};

/**
 * Query filter that excludes rows whose name starts with TEST-.
 * Always also apply isTestHotel or publicVisibleHotels, so a padded name
 * like "  TEST- Practice" cannot slip through.
 */
export function excludeTestHotelNames<T>(query: NameFilterQuery<T>): T {
  return query.not('name', 'ilike', TEST_HOTEL_NAME_ILIKE);
}

export function publicVisibleHotels<T extends { name?: unknown }>(hotels: readonly T[]): T[] {
  return hotels.filter((hotel) => !isTestHotel(hotel.name));
}

/** Message for a refused public quote or booking, or null when the hotel may be shown. */
export function refusePublicTestHotel(name: unknown): string | null {
  return isTestHotel(name) ? PUBLIC_TEST_HOTEL_REFUSAL : null;
}

/** True when a public hotel page should 404 (missing row or TEST- name). */
export function publicHotelNotFound<T extends { name?: unknown } | null | undefined>(hotel: T): boolean {
  return !hotel || isTestHotel(hotel.name);
}
