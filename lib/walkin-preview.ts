import { diffDays, isCalendarDate, staffBookingMinDate } from './date.ts';

/** Walk-in / staff booking check-in defaults to the hotel's business today (Asia/Manila unless overridden). */
export function defaultWalkInCheckIn(timeZone?: string | null, now: Date = new Date()): string {
  return staffBookingMinDate(timeZone, now);
}

/** Both dates must be real calendar days, and check-out must be after check-in. */
export function stayDatesReady(checkIn: string, checkOut: string): boolean {
  return isCalendarDate(checkIn) && isCalendarDate(checkOut) && checkOut > checkIn;
}

/** Night count for the staff booking preview, or null when totals should not be shown. */
export function walkInPreviewNights(checkIn: string, checkOut: string): number | null {
  if (!stayDatesReady(checkIn, checkOut)) return null;
  return Math.max(1, diffDays(checkIn, checkOut));
}
